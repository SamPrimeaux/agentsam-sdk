import test from 'node:test';
import assert from 'node:assert/strict';
import { createSqliteD1 } from './work-sqlite-d1.js';
import { readProjectInsights } from './work-project-insights.js';

test('project insights honor account ownership and expose no other users costs or rules', async () => {
  const db = createSqliteD1(':memory:');
  try {
    db.exec([
      'CREATE TABLE projects (id TEXT PRIMARY KEY, owner_user_id TEXT)',
      'CREATE TABLE project_costs (id INTEGER PRIMARY KEY, project_id TEXT, amount REAL)',
      'CREATE TABLE agentsam_rules_document (id TEXT PRIMARY KEY, project_id TEXT, user_id TEXT, title TEXT, version INTEGER, updated_at TEXT, is_active INTEGER, body_markdown TEXT)',
      "INSERT INTO projects VALUES ('p1','owner-a'),('p2','owner-b')",
      "INSERT INTO project_costs (project_id,amount) VALUES ('p1',2.5),('p1',1.25),('p2',1000)",
      "INSERT INTO agentsam_rules_document VALUES ('rule_p1_runtimecontract','p1','owner-a','Actual project rules',5,'2026-10-15',1,'Rules'),('rule_p2_runtimecontract','p2','owner-b','Private rules',1,'2026-10-15',1,'Private')",
    ].join(';\n') + ';');
    const a = await readProjectInsights(db, 'owner-a', 'p1');
    assert.equal(a.costs.recordedTotal, 3.75);
    assert.equal(a.costs.lineItems, 2);
    assert.equal(a.rules.version, 5);
    assert.equal(await readProjectInsights(db, 'owner-a', 'p2'), null);
    assert.equal(await readProjectInsights(db, 'owner-b', 'p1'), null);
    assert.equal(await readProjectInsights(db, 'owner-a', 'bad'), null);
  } finally { db.close(); }
});
test('missing measurements are null, not fabricated zero', async () => {
  const db = createSqliteD1(':memory:');
  try {
    db.exec("CREATE TABLE projects (id TEXT PRIMARY KEY, owner_user_id TEXT); INSERT INTO projects VALUES ('p1','owner');");
    const x = await readProjectInsights(db, 'owner', 'p1');
    assert.deepEqual([x.costs, x.rules, x.costsConnected, x.rulesConnected], [null, null, false, false]);
  } finally { db.close(); }
});
