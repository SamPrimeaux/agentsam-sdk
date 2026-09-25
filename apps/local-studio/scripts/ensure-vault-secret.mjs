import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerBin = path.join(appRoot, "node_modules", ".bin", "wrangler");
const configPath = path.join(appRoot, "backend", "wrangler.jsonc");

function runWrangler(args, options = {}) {
  return spawnSync(wranglerBin, [...args, "-c", configPath], {
    cwd: appRoot,
    encoding: "utf8",
    env: process.env,
    ...options,
  });
}

const listed = runWrangler(["secret", "list"]);
if (listed.status !== 0) {
  process.stderr.write(listed.stderr || "Could not list Worker secrets.\n");
  process.exit(listed.status || 1);
}

let secrets;
try {
  secrets = JSON.parse(listed.stdout || "[]");
} catch {
  process.stderr.write("Wrangler returned an unreadable secret list.\n");
  process.exit(1);
}

if (secrets.some((secret) => secret?.name === "VAULT_MASTER_KEY")) {
  process.stdout.write("AgentSam vault key already configured.\n");
  process.exit(0);
}

const vaultKey = `v1.${randomBytes(32).toString("base64")}`;
const created = runWrangler(["secret", "put", "VAULT_MASTER_KEY"], {
  input: `${vaultKey}\n`,
  stdio: ["pipe", "inherit", "inherit"],
});
if (created.status !== 0) process.exit(created.status || 1);
process.stdout.write("AgentSam vault key provisioned (v1.32-byte format).\n");
