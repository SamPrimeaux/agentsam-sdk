import test from "node:test";
import assert from "node:assert/strict";
import { dockerFilesViaAgentsamd, resolveInRoot, versionOf } from "./docker-agentsamd-files.ts";

type Call = { route: string; body: Record<string, unknown> };
function fake(files: Record<string, string>) {
  const calls: Call[] = [];
  const request = async (route: string, body: Record<string, unknown>) => {
    calls.push({ route, body });
    const path = String(body.path);
    if (route.endsWith("files/read")) {
      if (!(path in files)) throw new Error("no such path");
      return { ok: true, encoding: "utf8", content: files[path] };
    }
    if (route.endsWith("files/list")) {
      return { ok: true, entries: [
        { path: path + "/server.py", type: "file", size: 5 },
        { path: path + "/lib", type: "dir", size: 0 },
        { path: path + "/link", type: "symlink", size: 0 },
      ] };
    }
    if (route.endsWith("files/write")) { files[path] = String(body.content); return { ok: true }; }
    return { ok: true };
  };
  return { calls, request };
}
const base = { container: "cad", root: "/app" };

test("paths resolve inside the root and never escape it", () => {
  assert.equal(resolveInRoot("/app", "."), "/app");
  assert.equal(resolveInRoot("/app/", "src/a.py"), "/app/src/a.py");
  assert.throws(() => resolveInRoot("/app", "../etc/passwd"), /docker_path_outside_root/);
  assert.throws(() => resolveInRoot("relative", "a"), /docker_root_invalid/);
});

test("list returns root-relative entries as files and folders", async () => {
  const f = fake({});
  const out = await dockerFilesViaAgentsamd("list", { ...base, path: "." }, f.request) as { entries: { path: string; kind: string }[] };
  assert.deepEqual(out.entries.map(e => [e.path, e.kind]), [["server.py", "file"], ["lib", "folder"]]);
});

test("write needs approval and the current version", async () => {
  const files: Record<string, string> = { "/app/server.py": "hello" };
  const f = fake(files);
  await assert.rejects(dockerFilesViaAgentsamd("write", { ...base, path: "server.py", content: "x" }, f.request), /docker_approval_required/);
  const read = await dockerFilesViaAgentsamd("read", { ...base, path: "server.py" }, f.request) as { version: string };
  assert.equal(read.version, await versionOf(new TextEncoder().encode("hello")));
  await assert.rejects(
    dockerFilesViaAgentsamd("write", { ...base, path: "server.py", content: "x", expectedVersion: "stale", approved: true }, f.request),
    /docker_version_conflict/);
  const out = await dockerFilesViaAgentsamd("write", { ...base, path: "server.py", content: "patched", expectedVersion: read.version, approved: true }, f.request) as { version: string };
  assert.equal(files["/app/server.py"], "patched");
  assert.equal(out.version, await versionOf(new TextEncoder().encode("patched")));
});

test("create refuses to overwrite, rename stays in the folder, folders delete recursively", async () => {
  const f = fake({ "/app/a.txt": "1" });
  await assert.rejects(dockerFilesViaAgentsamd("create", { ...base, path: "a.txt", approved: true }, f.request), /docker_path_exists/);
  await assert.rejects(dockerFilesViaAgentsamd("rename", { ...base, path: "a.txt", destination: "../b", approved: true }, f.request), /docker_path_outside_root/);
  await dockerFilesViaAgentsamd("rename", { ...base, path: "a.txt", destination: "b.txt", approved: true }, f.request);
  assert.deepEqual(f.calls.at(-1), { route: "/v1/docker/files/rename", body: { container: "cad", path: "/app/a.txt", destination: "/app/b.txt" } });
  await dockerFilesViaAgentsamd("delete", { ...base, path: "lib", approved: true }, f.request);
  assert.equal(f.calls.at(-1)?.body.recursive, true);
});
