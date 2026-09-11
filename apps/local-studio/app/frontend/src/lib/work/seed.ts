import { languageFromPath, uid } from "@/lib/utils";
import { emptyGit } from "@/lib/work/git";
import type { Artifact, DeployTarget, Project } from "@/lib/work/types";

function file(path: string, content: string, extra?: Partial<Artifact>): Artifact {
  return {
    id: uid(),
    path,
    language: languageFromPath(path),
    content,
    updatedAt: Date.now(),
    kind: extra?.kind ?? (path.endsWith(".html") ? "preview" : "code"),
    origin: extra?.origin ?? "seed",
    title: extra?.title,
    url: extra?.url,
  };
}

export function emptyDeploy(): DeployTarget {
  return {
    githubOwner: "",
    githubRepo: "",
    githubBranch: "main",
    cloudflareAccountId: "",
    cloudflareProject: "",
  };
}

export function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "studio"
  );
}

export function seedFiles(projectName: string): Artifact[] {
  const slug = slugify(projectName);
  return [
    file(
      "README.md",
      `# ${projectName}

Workspace for AgentSam Work.

- Trails are stored chats
- Side chats stay ephemeral until you keep them
- Files open in Monaco
- CLI is a real xterm over this virtual workspace
- Ship via GitHub or Cloudflare Pages

## CLI

\`\`\`
ls
cat README.md
git init
git add .
git commit -m "init"
wrangler pages deploy
\`\`\`

Tokens live in Ship — they never leave this browser except toward GitHub or Cloudflare.
`,
    ),
    file(
      "index.html",
      `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main>
      <p class="kicker">InnerAnimalMedia</p>
      <h1>${projectName}</h1>
      <p class="lede">A calm studio workbench. Edit this page in Monaco, preview it in the browser pane, then ship it with the CLI.</p>
      <p class="meta">wrangler pages deploy · git push</p>
    </main>
    <script src="./src/app.js"></script>
  </body>
</html>
`,
    ),
    file(
      "styles.css",
      `:root {
  color-scheme: dark;
  --ink: #070708;
  --paper: #f3f1ec;
  --stone: #c4b8a8;
  --clay: #8a7f72;
}

* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; background: var(--ink); color: var(--paper); }
body {
  font: 16px/1.5 "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}
main { max-width: 36rem; }
.kicker {
  margin: 0 0 12px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--clay);
  font-size: 11px;
}
h1 {
  margin: 0 0 16px;
  font-size: 2.4rem;
  letter-spacing: -0.04em;
  font-weight: 500;
}
.lede { margin: 0; color: var(--stone); }
.meta { margin: 28px 0 0; color: var(--clay); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
`,
    ),
    file(
      "src/app.js",
      `document.documentElement.dataset.ready = "sam";
console.info("${projectName} ready");
`,
    ),
    file(
      "wrangler.toml",
      `name = "${slug}"
compatibility_date = "2026-09-01"
pages_build_output_dir = "."
`,
    ),
    file(
      ".github/workflows/deploy.yml",
      `name: Cloudflare Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy . --project-name=${slug}
`,
    ),
  ];
}

export function newProject(name = "Studio", description = "Default workspace"): Project {
  const now = Date.now();
  return {
    id: uid(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    files: seedFiles(name),
    dirs: ["src", ".github", ".github/workflows"],
    git: emptyGit(),
    deploy: {
      ...emptyDeploy(),
      cloudflareProject: slugify(name),
      githubRepo: slugify(name),
      githubBranch: "main",
    },
    cwd: "/",
  };
}
