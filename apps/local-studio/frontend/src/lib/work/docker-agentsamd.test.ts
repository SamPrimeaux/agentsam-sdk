import test from "node:test";
import assert from "node:assert/strict";
import { dockerViaAgentsamd, dockerName } from "./docker-agentsamd.ts";
import { agentsamdExec, AgentsamdError, getAgentsamdToken, setAgentsamdToken } from "./agentsamd-client.ts";

const ok = (stdout = "", stderr = "") => ({ ok: true, exit_code: 0, stdout, stderr });
function recorder(result = ok()) {
  const calls: { command: string; args: string[] }[] = [];
  return { calls, exec: async (command: string, args: string[]) => { calls.push({ command, args }); return result; } };
}
const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
};

test("contexts lists docker contexts without a context flag", async () => {
  const { calls, exec } = recorder(ok('{"Name":"desktop-linux","Current":true,"Description":"Docker Desktop"}\n'));
  const out = await dockerViaAgentsamd("contexts", {}, exec) as { contexts: { name: string }[] };
  assert.deepEqual(calls[0].args, ["context", "ls", "--format", "{{json .}}"]);
  assert.equal(out.contexts[0].name, "desktop-linux");
});

test("containers and images always pin the selected context", async () => {
  const { calls, exec } = recorder(ok('{"ID":"abc","Names":"agentsam-cad"}\n'));
  await dockerViaAgentsamd("containers", { context: "desktop-linux" }, exec);
  await dockerViaAgentsamd("images", { context: "desktop-linux" }, exec);
  assert.deepEqual(calls[0].args.slice(0, 2), ["--context", "desktop-linux"]);
  assert.deepEqual(calls[1].args.slice(0, 2), ["--context", "desktop-linux"]);
});

test("lifecycle needs explicit approval and ends options before the container id", async () => {
  const { calls, exec } = recorder();
  await assert.rejects(dockerViaAgentsamd("restart", { context: "c", container: "x" }, exec), /docker_approval_required/);
  assert.equal(calls.length, 0);
  await dockerViaAgentsamd("restart", { context: "c", container: "x", approved: true }, exec);
  assert.deepEqual(calls[0].args, ["--context", "c", "restart", "--", "x"]);
});

test("identifiers that could smuggle docker flags are rejected before anything runs", async () => {
  const { calls, exec } = recorder();
  for (const bad of ["--privileged", "-h", "a b", "a;b", "", "x".repeat(129), "../x"]) {
    assert.throws(() => dockerName(bad), /docker_identifier_invalid/);
  }
  assert.equal(dockerName("desktop-linux"), "desktop-linux");
  await assert.rejects(dockerViaAgentsamd("containers", { context: "a b" }, exec), /docker_identifier_invalid/);
  assert.equal(calls.length, 0);
});

test("remote engines are ssh-only and need approval", async () => {
  const { calls, exec } = recorder();
  await assert.rejects(dockerViaAgentsamd("createContext", { context: "r", endpoint: "ssh://u@h" }, exec), /docker_approval_required/);
  await assert.rejects(dockerViaAgentsamd("createContext", { context: "r", endpoint: "tcp://h:2375", approved: true }, exec), /docker_ssh_endpoint_invalid/);
  await dockerViaAgentsamd("createContext", { context: "r", endpoint: "ssh://u@h.example:22", approved: true }, exec);
  assert.deepEqual(calls[0].args, ["context", "create", "r", "--docker", "host=ssh://u@h.example:22"]);
});

test("container file operations are not offered over agentsamd", async () => {
  await assert.rejects(dockerViaAgentsamd("write", { context: "c", container: "x" }, recorder().exec), /docker_files_require_desktop/);
});

test("a failing docker command surfaces its first stderr line", async () => {
  const { exec } = recorder({ ok: false, exit_code: 1, stdout: "", stderr: "Cannot connect to the Docker daemon\nmore" });
  await assert.rejects(dockerViaAgentsamd("health", { context: "c" }, exec), /docker_command_failed: Cannot connect to the Docker daemon$/);
});

test("exec sends the pairing token header and requires pairing first", async () => {
  const seen: { headers?: Record<string, string> }[] = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    seen.push({ headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify({ ok: true, exit_code: 0, stdout: "x", stderr: "" }), { status: 200 });
  };
  const store = memory();
  await assert.rejects(agentsamdExec("docker", [], { fetchImpl, store }), (e: unknown) => e instanceof AgentsamdError && e.code === "agentsamd_pairing_required");
  assert.equal(setAgentsamdToken("not-a-token", store), false);
  const token = "a".repeat(64);
  assert.equal(setAgentsamdToken(token, store), true);
  assert.equal(getAgentsamdToken(store), token);
  const result = await agentsamdExec("docker", ["ps"], { fetchImpl, store });
  assert.equal(result.stdout, "x");
  assert.equal(seen[0].headers?.["X-Agentsamd-Token"], token);
});

test("a rejected token is forgotten so the user is asked to pair again", async () => {
  const store = memory();
  setAgentsamdToken("b".repeat(64), store);
  const fetchImpl = async () => new Response("{}", { status: 401 });
  await assert.rejects(agentsamdExec("docker", [], { fetchImpl, store }), (e: unknown) => e instanceof AgentsamdError && e.code === "agentsamd_pairing_required");
  assert.equal(getAgentsamdToken(store), null);
});

test("an unreachable daemon is reported distinctly from a bad token", async () => {
  const store = memory();
  setAgentsamdToken("c".repeat(64), store);
  const fetchImpl = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(agentsamdExec("docker", [], { fetchImpl, store }), (e: unknown) => e instanceof AgentsamdError && e.code === "agentsamd_unreachable");
});
