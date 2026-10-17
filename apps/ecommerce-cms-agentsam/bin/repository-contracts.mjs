#!/usr/bin/env node
/**
 * Repository contract registry -> D1 (agentsam_repository_contracts).
 *
 *   repository-contracts.mjs generate [--output <file>]   write the seed SQL
 *   repository-contracts.mjs verify [--remote]            prove registry, files and (optionally) D1 agree
 *
 * Identity is never passed in or hardcoded:
 *   repository_id  derived from the git remote by the SDK's own resolver
 *                  (override with --repository-id only for a repo without a remote)
 *   account_id     bound by the generated SQL from the host registry (code_repositories),
 *                  as the SDK contract model prescribes; a repository that is not registered
 *                  seeds nothing, and `verify --remote` reports it.
 *   database       d1_databases.database_name in wrangler.toml
 *
 * A contract here pins a manifest file by sha256 and declares its type and version.
 * `verify` is what makes that a gate: it fails when a pinned file changed, a row is
 * missing, or a row is bound to the wrong account.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tryResolveGitContext } from "@inneranimalmedia/agentsam-repository/git-context";
import {
  createRepositoryContract,
  REPOSITORY_CONTRACT_STATUSES,
  REPOSITORY_CONTRACT_TYPES,
} from "@inneranimalmedia/agentsam-repository/contracts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(appRoot, "../..");
const REGISTRY_SCHEMA = "agentsam.repository-contracts.v1";
const PROVIDERS = { "github.com": "github", "gitlab.com": "gitlab", "bitbucket.org": "bitbucket" };

const args = process.argv.slice(2);
const command = args[0] && !args[0].startsWith("-") ? args[0] : "generate";

function flag(name, fallback = null) {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1] ?? fallback;
}
const has = (name) => args.includes(name);

const sqlText = (value) => (value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const stableId = (repositoryId, key, version) =>
  "rct_" + createHash("sha1").update(`${repositoryId}:${key}:${version}`).digest("hex").slice(0, 16);

function resolveRepositoryId() {
  const explicit = flag("--repository-id");
  if (explicit) return explicit;
  const git = tryResolveGitContext({ cwd: repoRoot });
  const provider = PROVIDERS[String(git?.remoteHost || "").toLowerCase()];
  if (!git?.repoFullName || !provider) {
    throw new Error("Cannot derive repository_id from the git remote. Add an origin remote or pass --repository-id.");
  }
  return `${provider}:${git.repoFullName.toLowerCase()}`;
}

/** Load the registry, validate it, and hash every pinned manifest. */
async function loadContracts() {
  const registry = JSON.parse(await readFile(path.join(appRoot, "repository.contracts.json"), "utf8"));
  const problems = [];
  if (registry.schema !== REGISTRY_SCHEMA) problems.push(`registry schema must be ${REGISTRY_SCHEMA}`);
  const seen = new Set();
  const rows = [];
  for (const contract of registry.contracts || []) {
    const label = `${contract.contract_key}@${contract.contract_version}`;
    if (seen.has(label)) problems.push(`duplicate contract ${label}`);
    seen.add(label);
    if (!REPOSITORY_CONTRACT_TYPES.includes(contract.contract_type)) problems.push(`${label}: unsupported contract_type "${contract.contract_type}"`);
    const status = contract.status || "active";
    if (!REPOSITORY_CONTRACT_STATUSES.includes(status)) problems.push(`${label}: unsupported status "${status}"`);
    let bytes;
    try {
      bytes = await readFile(path.join(repoRoot, contract.manifest_path));
    } catch {
      problems.push(`${label}: pinned file is missing: ${contract.manifest_path}`);
      continue;
    }
    if (contract.manifest_path.endsWith(".json")) {
      try { JSON.parse(bytes); } catch { problems.push(`${label}: ${contract.manifest_path} is not valid JSON`); }
    }
    rows.push({
      ...contract,
      status,
      contract_hash: sha256(bytes),
      metadata_json: JSON.stringify({ ...(contract.metadata || {}), hash_algorithm: "sha256" }),
    });
  }
  return { rows, problems };
}

async function generate() {
  const { rows, problems } = await loadContracts();
  if (problems.length) throw new Error("Registry is invalid:\n  " + problems.join("\n  "));
  const repositoryId = resolveRepositoryId();
  const output = path.resolve(flag("--output", path.join(repoRoot, "db/seed-agentsam-repository-contracts.generated.sql")));

  const statements = rows.map((row) => {
    const select = [
      sqlText(stableId(repositoryId, row.contract_key, row.contract_version)),
      "r.account_id",
      "r.id",
      sqlText(row.contract_key),
      sqlText(row.contract_version),
      sqlText(row.contract_type),
      sqlText(row.name),
      sqlText(row.description),
      sqlText(row.manifest_path),
      sqlText(row.contract_hash),
      sqlText(row.status),
      sqlText(row.metadata_json),
      "unixepoch()",
      "unixepoch()",
    ].join(", ");
    return (
      "INSERT INTO agentsam_repository_contracts (\n" +
      "  id, account_id, repository_id, contract_key, contract_version, contract_type,\n" +
      "  name, description, manifest_path, contract_hash, status, metadata_json,\n" +
      "  created_at, updated_at\n" +
      ")\n" +
      `SELECT ${select}\n` +
      `FROM code_repositories r WHERE r.id = ${sqlText(repositoryId)}\n` +
      "ON CONFLICT(repository_id,contract_key,contract_version) DO UPDATE SET\n" +
      "  account_id=excluded.account_id,\n" +
      "  contract_type=excluded.contract_type,\n" +
      "  name=excluded.name,\n" +
      "  description=excluded.description,\n" +
      "  manifest_path=excluded.manifest_path,\n" +
      "  contract_hash=excluded.contract_hash,\n" +
      "  status=excluded.status,\n" +
      "  metadata_json=excluded.metadata_json,\n" +
      "  updated_at=unixepoch();\n"
    );
  });

  await writeFile(
    output,
    "-- GENERATED by apps/ecommerce-cms-agentsam/bin/repository-contracts.mjs\n" +
      "-- Source: apps/ecommerce-cms-agentsam/repository.contracts.json\n" +
      "-- account_id is bound from code_repositories; an unregistered repository seeds nothing.\n" +
      statements.join("\n"),
  );
  console.log(JSON.stringify({ ok: true, output, repository_id: repositoryId, contracts: rows.length }, null, 2));
}

async function databaseName() {
  const toml = await readFile(path.join(repoRoot, "wrangler.toml"), "utf8");
  const match = toml.match(/\[\[d1_databases\]\][^[]*?database_name\s*=\s*"([^"]+)"/s);
  if (!match) throw new Error("No [[d1_databases]] database_name in wrangler.toml");
  return match[1];
}

function d1(database, sql) {
  const run = spawnSync("npx", ["wrangler", "d1", "execute", database, "--remote", "--json", "--command", sql], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const out = run.stdout || "";
  try {
    return JSON.parse(out.slice(out.indexOf("[")))[0].results || [];
  } catch {
    throw new Error("D1 query failed. Run via ./scripts/with-cf-admin-env.sh.\n" + (run.stderr || out).slice(-400));
  }
}

async function verify() {
  const { rows, problems } = await loadContracts();
  const warnings = [];
  let repositoryId = null;

  if (has("--remote")) {
    repositoryId = resolveRepositoryId();
    const database = await databaseName();
    const registered = d1(database, `SELECT account_id FROM code_repositories WHERE id = ${sqlText(repositoryId)}`)[0];
    if (!registered) {
      problems.push(`${repositoryId} is not registered in code_repositories (nothing can be seeded for it)`);
    } else {
      const live = d1(
        database,
        `SELECT id, contract_key, contract_version, contract_type, name, description, manifest_path, contract_hash, status, account_id
           FROM agentsam_repository_contracts WHERE repository_id = ${sqlText(repositoryId)}`,
      );
      const byLabel = new Map(live.map((r) => [`${r.contract_key}@${r.contract_version}`, r]));
      for (const row of rows) {
        const label = `${row.contract_key}@${row.contract_version}`;
        const current = byLabel.get(label);
        byLabel.delete(label);
        if (!current) problems.push(`${label}: not seeded in D1`);
        else {
          if (current.account_id !== registered.account_id) problems.push(`${label}: bound to account "${current.account_id}", registry says "${registered.account_id}"`);
          if (current.contract_hash !== row.contract_hash) problems.push(`${label}: ${row.manifest_path} changed since it was seeded (re-run the seed)`);
        }
      }
      for (const [label, current] of byLabel) {
        try {
          createRepositoryContract({ ...current, repository_id: repositoryId });
          warnings.push(`${label}: in D1 but not in the registry`);
        } catch (error) {
          warnings.push(`${label}: in D1 but not in the registry, and not a valid SDK contract (${error.message})`);
        }
      }
    }
  }

  const ok = problems.length === 0;
  console.log(JSON.stringify({ ok, repository_id: repositoryId, contracts: rows.length, remote: has("--remote"), problems, warnings }, null, 2));
  process.exit(ok ? 0 : 1);
}

const commands = { generate, verify };
if (!commands[command]) {
  console.error(`Unknown command "${command}". Use: generate | verify [--remote]`);
  process.exit(1);
}
commands[command]().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
