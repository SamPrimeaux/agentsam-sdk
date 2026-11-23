import { execFileSync } from "node:child_process";
import { assertCurrentMainDeployment, parseRemoteMainRef } from "./deploy-main-guard.mjs";

const git = (args) => execFileSync("git", args, {
  encoding: "utf8",
  timeout: 15000,
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
}).trim();

// Verify actual remote main immediately before Wrangler: another agent may
// already have merged a newer release during the build.
const gitSha = git(["rev-parse", "HEAD"]);
const remoteMainSha = parseRemoteMainRef(git(["ls-remote", "--exit-code", "origin", "refs/heads/main"]));
assertCurrentMainDeployment(gitSha, remoteMainSha);

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
    "git_sha=" + gitSha,
  ],
  { stdio: "inherit", env: process.env },
);
