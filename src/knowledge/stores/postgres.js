import fs from 'node:fs';

export const postgresSchema = fs.readFileSync(new URL('./postgres.sql', import.meta.url), 'utf8');

/** Supply a dedicated connected pg Client, not a Pool's multiplexed query(). */
export function createPostgresStore(client) {
  const active = async scope => (await client.query('SELECT g.payload FROM agentsam_knowledge.active a JOIN agentsam_knowledge.generations g ON g.id=a.id WHERE a.scope=$1', [scope])).rows[0]?.payload || null;
  return {
    active,
    async setup() { await client.query('BEGIN'); try { await client.query(postgresSchema); await client.query('COMMIT'); } catch (e) { await client.query('ROLLBACK'); throw e; } },
    async getGeneration(scope, id) { return (await client.query('SELECT payload FROM agentsam_knowledge.generations WHERE scope=$1 AND id=$2', [scope, id])).rows[0]?.payload || null; },
    async cacheGet(key) { return (await client.query('SELECT value FROM agentsam_knowledge.cache WHERE key=$1', [key])).rows[0]?.value || null; },
    async cachePut(key, value) {
      const vector = key.includes(':vector:') ? JSON.stringify(value) : null;
      await client.query('INSERT INTO agentsam_knowledge.cache(key,value,embedding) VALUES ($1,$2::jsonb,$3::vector) ON CONFLICT(key) DO NOTHING', [key, JSON.stringify(value), vector]);
    },
    async rankVectors(keys, vector) {
      const { rows } = await client.query(`WITH candidates AS MATERIALIZED (
        SELECT key,embedding FROM agentsam_knowledge.cache WHERE key=ANY($1::text[]) AND vector_dims(embedding)=$3
      ) SELECT key,1-(embedding <=> $2::vector) AS score FROM candidates`, [keys, JSON.stringify(vector), vector.length]);
      return new Map(rows.map(row => [row.key, Number(row.score)]));
    },
    async publish(generation, expectedId) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [generation.scope_key]);
        if ((await active(generation.scope_key))?.id !== (expectedId || undefined)) throw new Error('Index changed concurrently; rerun before publication.');
        await client.query('INSERT INTO agentsam_knowledge.generations VALUES ($1,$2,$3,$4::jsonb)', [generation.id, generation.scope_key, generation.created_at, JSON.stringify(generation)]);
        await client.query('INSERT INTO agentsam_knowledge.active VALUES ($1,$2) ON CONFLICT(scope) DO UPDATE SET id=excluded.id', [generation.scope_key, generation.id]);
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; }
    },
    async history(scope) { return (await client.query('SELECT payload FROM agentsam_knowledge.generations WHERE scope=$1 ORDER BY created_at,id', [scope])).rows.map(r => r.payload); },
    async observe(namespace, observation) { await client.query('INSERT INTO agentsam_knowledge.observations VALUES ($1,$2,$3,$4::jsonb)', [observation.id, namespace, observation.created_at, JSON.stringify(observation)]); },
    async observations(namespace) { return (await client.query('SELECT payload FROM agentsam_knowledge.observations WHERE namespace=$1 ORDER BY created_at,id', [namespace])).rows.map(r => r.payload); },
    async close() { await client.end(); },
  };
}

export async function openPostgresStore(connectionString) {
  if (!connectionString) throw new Error('Configured Postgres connection environment variable is missing.');
  const { Client } = await import('pg');
  const client = new Client({ connectionString, connectionTimeoutMillis: 10000, statement_timeout: 30000 });
  try {
    await client.connect();
    await client.query('SET search_path = agentsam_knowledge, public, extensions');
    return createPostgresStore(client);
  } catch { await client.end().catch(() => {}); throw new Error('Postgres connection failed; check the configured connection and TLS settings.'); }
}
