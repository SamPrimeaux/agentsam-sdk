#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const manifestPath = path.join(packageRoot, "agentsam.app.json");
const desktopRoot = path.join(packageRoot, "desktop-dist");
const desktopIndex = path.join(desktopRoot, "index.html");

const MIME = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function usage() {
  console.log(`AgentSam Local Studio

agentsam-studio [preview]
agentsam-studio info
agentsam-studio doctor

preview:
  --host <host>   default 127.0.0.1
  --port <port>   default 8081`);
}

function info() {
  if (!fs.existsSync(manifestPath)) {
    console.error(`missing manifest: ${manifestPath}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      JSON.parse(fs.readFileSync(manifestPath, "utf8")),
      null,
      2,
    ),
  );
}

function doctor() {
  const required = [
    "package.json",
    "agentsam.app.json",
    "bin/agentsam-studio.mjs",
    "desktop-dist/index.html",
  ];

  const missing = required.filter(
    (rel) => !fs.existsSync(path.join(packageRoot, rel)),
  );

  if (missing.length) {
    console.error("missing release artifacts:");
    for (const item of missing) console.error(`  - ${item}`);
    process.exit(1);
  }

  console.log("✓ Local Studio release package OK");
  console.log(`  root: ${packageRoot}`);
  console.log(`  ui:   ${desktopIndex}`);
}

function parseArgs(args) {
  let host = "127.0.0.1";
  let port = 8081;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--host") {
      host = args[++i];
      if (!host) throw new Error("--host requires a value");
      continue;
    }

    if (args[i] === "--port") {
      const raw = args[++i];
      port = Number(raw);

      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`invalid port: ${raw}`);
      }

      continue;
    }

    throw new Error(`unknown option: ${args[i]}`);
  }

  return { host, port };
}

function resolveRequest(urlPath) {
  const pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = path.resolve(desktopRoot, rel);
  const relative = path.relative(desktopRoot, candidate);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }

  return candidate;
}

function serveFile(res, filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();

  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control":
      path.basename(filePath) === "index.html"
        ? "no-cache"
        : "public, max-age=31536000, immutable",
  });

  fs.createReadStream(filePath).pipe(res);
  return true;
}

function preview(args) {
  if (!fs.existsSync(desktopIndex)) {
    console.error(`missing packaged UI: ${desktopIndex}`);
    process.exit(1);
  }

  let options;

  try {
    options = parseArgs(args);
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }

  const server = http.createServer((req, res) => {
    try {
      const candidate = resolveRequest(req.url);

      if (!candidate) {
        res.writeHead(400);
        res.end("Bad request");
        return;
      }

      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        serveFile(res, candidate);
        return;
      }

      // SPA history fallback.
      serveFile(res, desktopIndex);
    } catch (error) {
      console.error(error);

      if (!res.headersSent) {
        res.writeHead(500);
      }

      res.end("Internal server error");
    }
  });

  server.listen(options.port, options.host, () => {
    console.log(
      `AgentSam Local Studio: http://${options.host}:${options.port}`,
    );
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const [command = "preview", ...args] = process.argv.slice(2);

if (["help", "-h", "--help"].includes(command)) {
  usage();
} else if (command === "info") {
  info();
} else if (command === "doctor") {
  doctor();
} else if (command === "preview") {
  preview(args);
} else {
  console.error(`unknown command: ${command}`);
  usage();
  process.exit(2);
}
