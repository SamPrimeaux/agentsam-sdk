export function normalizePath(input: string) {
  const raw = input.trim() || "/";
  const absolute = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = absolute.split("/").filter((p) => p && p !== ".");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return `/${stack.join("/")}`;
}

export function joinPath(cwd: string, input: string) {
  if (!input) return normalizePath(cwd || "/");
  if (input.startsWith("/")) return normalizePath(input);
  return normalizePath(`${cwd || "/"}/${input}`);
}

export function toStoragePath(abs: string) {
  return normalizePath(abs).replace(/^\//, "");
}

export function toAbsPath(storage: string) {
  return normalizePath(`/${storage.replace(/^\//, "")}`);
}

export function parentDir(abs: string) {
  const n = normalizePath(abs);
  if (n === "/") return "/";
  const i = n.lastIndexOf("/");
  return i <= 0 ? "/" : n.slice(0, i);
}

export function baseName(abs: string) {
  const n = normalizePath(abs);
  if (n === "/") return "";
  return n.slice(n.lastIndexOf("/") + 1);
}

export function isInside(cwd: string, absFile: string) {
  const dir = normalizePath(cwd);
  const file = normalizePath(absFile);
  if (dir === "/") return true;
  return file === dir || file.startsWith(`${dir}/`);
}

export function childName(cwd: string, absPath: string) {
  const dir = normalizePath(cwd);
  const path = normalizePath(absPath);
  const rest = dir === "/" ? path.slice(1) : path.slice(dir.length + 1);
  return rest.split("/")[0] ?? "";
}
