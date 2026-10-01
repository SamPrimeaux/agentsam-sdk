import { execFileSync } from "node:child_process";

const gitSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!/^[0-9a-f]{40}$/i.test(gitSha)) throw new Error("git_sha_unavailable");

execFileSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "wrangler",
    "deploy",
    "-c",
    "backend/wrangler.jsonc",
    "--tag",
    gitSha,
    "--message",
    `git_sha=${gitSha}`,
  ],
  { stdio: "inherit", env: process.env },
);
