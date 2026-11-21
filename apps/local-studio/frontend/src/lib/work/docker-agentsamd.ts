/**
 * Docker over the local agentsamd daemon, for browsers that are not the desktop app.
 * Mirrors the desktop bridge's validation (same identifier rules, same approval gates)
 * and only runs `docker` on the user's own computer through their paired agentsamd.
 * Container file editing is not offered here: agentsamd exec has no stdin channel.
 */
import { agentsamdExec, AgentsamdError, type ExecResult } from "./agentsamd-client.ts";

export type DockerEngineAction =
  "contexts" | "createContext" | "health" | "containers" | "images" | "logs" | "start" | "stop" | "restart";
const ENGINE_ACTIONS: ReadonlySet<string> = new Set([
  "contexts", "createContext", "health", "containers", "images", "logs", "start", "stop", "restart",
]);
type Exec = (command: string, args: string[], options?: { timeoutMs?: number }) => Promise<ExecResult>;

export const isDockerEngineAction = (action: string): action is DockerEngineAction => ENGINE_ACTIONS.has(action);

export function dockerName(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (!text || text.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(text)) throw new Error("docker_identifier_invalid");
  return text;
}

function sshEndpoint(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (!text.startsWith("ssh://") || text.length > 240 || !text.includes("@")
      || !/^[A-Za-z0-9@._:-]+$/.test(text.slice("ssh://".length))) throw new Error("docker_ssh_endpoint_invalid");
  return text;
}

function lines(stdout: string): unknown[] {
  return stdout.split(/\r?\n/).filter(line => line.trim()).map(line => {
    try { return JSON.parse(line); } catch { throw new Error("docker_output_invalid"); }
  });
}

async function docker(exec: Exec, args: string[]): Promise<ExecResult> {
  const result = await exec("docker", args, { timeoutMs: 30000 });
  if (result.timed_out) throw new Error("docker_timed_out");
  if (result.exit_code !== 0) {
    const reason = (result.stderr || result.stdout).trim().split(/\r?\n/)[0]?.slice(0, 300);
    throw new Error(reason ? "docker_command_failed: " + reason : "docker_command_failed");
  }
  return result;
}

export async function dockerViaAgentsamd(
  action: string,
  fields: Record<string, unknown> = {},
  exec: Exec = agentsamdExec,
): Promise<Record<string, unknown>> {
  if (!isDockerEngineAction(action)) throw new Error("docker_files_require_desktop");
  if (action === "contexts") {
    const rows = lines((await docker(exec, ["context", "ls", "--format", "{{json .}}"])).stdout) as Record<string, unknown>[];
    return { ok: true, contexts: rows.map(row => ({ name: row.Name, current: row.Current, description: row.Description })) };
  }
  if (action === "createContext") {
    if (fields.approved !== true) throw new Error("docker_approval_required");
    const context = dockerName(fields.context);
    await docker(exec, ["context", "create", context, "--docker", "host=" + sshEndpoint(fields.endpoint)]);
    return { ok: true, context };
  }
  const context = dockerName(fields.context);
  if (action === "health") {
    const out = (await docker(exec, ["--context", context, "version", "--format", "{{json .}}"])).stdout;
    try { return { ok: true, engine: JSON.parse(out) }; } catch { throw new Error("docker_version_invalid"); }
  }
  if (action === "containers") {
    return { ok: true, containers: lines((await docker(exec, ["--context", context, "ps", "-a", "--format", "{{json .}}"])).stdout) };
  }
  if (action === "images") {
    return { ok: true, images: lines((await docker(exec, ["--context", context, "images", "--format", "{{json .}}"])).stdout) };
  }
  const container = dockerName(fields.container);
  if (action === "logs") {
    const result = await docker(exec, ["--context", context, "logs", "--tail", "250", "--", container]);
    return { ok: true, logs: result.stdout + result.stderr };
  }
  if (fields.approved !== true) throw new Error("docker_approval_required");
  await docker(exec, ["--context", context, action, "--", container]);
  return { ok: true, container };
}

export { AgentsamdError };
