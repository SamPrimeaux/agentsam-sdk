import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const output = path.join(root, "dist", "assets");

const app = path.join(
  root,
  "apps",
  "ecommerce-cms-agentsam"
);

const frontend = path.join(app, "frontend");

await rm(output, {
  recursive: true,
  force: true
});

await mkdir(output, {
  recursive: true
});

await cp(
  path.join(root, "public"),
  output,
  {
    recursive: true,
    filter: p =>
      ![".DS_Store", ".gitkeep"]
        .includes(path.basename(p))
  }
);

await cp(
  path.join(frontend, "static"),
  path.join(output, "admin"),
  { recursive: true }
);

await cp(
  path.join(frontend, "dist"),
  path.join(output, "admin", "_spa"),
  { recursive: true }
);

await mkdir(
  path.join(output, "admin", "js"),
  { recursive: true }
);

for (const file of [
  "shell.js",
  "inspector.js"
]) {
  await cp(
    path.join(frontend, file),
    path.join(output, "admin", "js", file)
  );
}

await cp(
  path.join(
    app,
    "shared",
    "media-kit",
    "src"
  ),
  path.join(
    output,
    "admin",
    "media-kit"
  ),
  { recursive: true }
);

console.log(
  "Assembled ecommerce admin assets into dist/assets"
);
