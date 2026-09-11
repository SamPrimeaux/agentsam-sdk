import { useState } from "react";
import { Cloud, Github, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { languageFromPath, uid } from "@/lib/utils";
import { readSecrets } from "@/lib/work/secrets";
import { slugify } from "@/lib/work/seed";
import { useActiveProject, useWorkStore } from "@/lib/work/store";

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; url?: string; sha?: string; files?: number };
  if (!res.ok) throw new Error(json.error || `Request failed ${res.status}`);
  return json;
}

export function DeployStage() {
  const project = useActiveProject();
  const patchProject = useWorkStore((s) => s.patchProject);
  const upsertFile = useWorkStore((s) => s.upsertFile);
  const setSettingsOpen = useWorkStore((s) => s.setSettingsOpen);
  const [busy, setBusy] = useState<"github" | "cloudflare" | null>(null);

  function saveDeploy<K extends keyof typeof project.deploy>(key: K, value: string) {
    patchProject(project.id, { deploy: { ...project.deploy, [key]: value } });
  }

  async function pushGithub() {
    const token = readSecrets().githubToken;
    if (!token) {
      setSettingsOpen(true);
      toast("Add a GitHub token first");
      return;
    }
    const owner = project.deploy.githubOwner.trim();
    const repo = project.deploy.githubRepo.trim() || slugify(project.name);
    if (!owner || !repo) {
      toast("Owner and repo are required");
      return;
    }
    setBusy("github");
    try {
      const result = await postJson("/api/github", {
        token,
        owner,
        repo,
        branch: project.deploy.githubBranch || "main",
        message: `ship: ${project.name}`,
        files: project.files.map((f) => ({ path: f.path, content: f.content })),
      });
      const url = result.url ?? `https://github.com/${owner}/${repo}`;
      patchProject(project.id, {
        deploy: { ...project.deploy, githubOwner: owner, githubRepo: repo, lastGithubUrl: url, lastGithubAt: Date.now() },
      });
      upsertFile(project.id, {
        id: uid(),
        path: `.agentsam/deploys/github-${Date.now()}.log`,
        language: languageFromPath("log"),
        content: `Pushed ${result.files ?? project.files.length} files\n${url}\n${result.sha ?? ""}`,
        updatedAt: Date.now(),
        kind: "deploy",
        origin: "deploy",
        title: "GitHub push",
        url,
      });
      toast("Pushed to GitHub");
    } catch (err) {
      toast(err instanceof Error ? err.message : "GitHub push failed");
    } finally {
      setBusy(null);
    }
  }

  async function deployCloudflare() {
    const token = readSecrets().cloudflareToken;
    if (!token) {
      setSettingsOpen(true);
      toast("Add a Cloudflare token first");
      return;
    }
    const accountId = project.deploy.cloudflareAccountId.trim();
    const name = project.deploy.cloudflareProject.trim() || slugify(project.name);
    if (!accountId) {
      toast("Cloudflare account id is required");
      return;
    }
    setBusy("cloudflare");
    try {
      const result = await postJson("/api/cloudflare", {
        token,
        accountId,
        projectName: name,
        files: project.files.map((f) => ({ path: f.path, content: f.content })),
      });
      const url = result.url ?? `https://${name}.pages.dev`;
      patchProject(project.id, {
        deploy: {
          ...project.deploy,
          cloudflareProject: name,
          lastCloudflareUrl: url,
          lastCloudflareAt: Date.now(),
        },
      });
      upsertFile(project.id, {
        id: uid(),
        path: `.agentsam/deploys/cloudflare-${Date.now()}.log`,
        language: "plaintext",
        content: `Deployed ${result.files ?? project.files.length} files\n${url}`,
        updatedAt: Date.now(),
        kind: "deploy",
        origin: "deploy",
        title: "Cloudflare Pages",
        url,
      });
      toast("Deployed to Cloudflare Pages");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Cloudflare deploy failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="scrollbar-thin h-full overflow-y-auto px-4 py-5">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <div>
          <h2 className="text-base font-medium tracking-tight">Ship</h2>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            Push the workspace to GitHub, or upload it as a Cloudflare Pages project. Tokens stay in this browser.
          </p>
        </div>

        <section className="rounded-2xl bg-card p-4 shadow-hairline">
          <div className="mb-3 flex items-center gap-2">
            <Github className="size-4 text-stone" />
            <h3 className="text-sm font-medium">GitHub</h3>
          </div>
          <div className="flex flex-col gap-2">
            <Input
              placeholder="owner"
              value={project.deploy.githubOwner}
              onChange={(e) => saveDeploy("githubOwner", e.target.value)}
              aria-label="GitHub owner"
            />
            <div className="flex gap-2">
              <Input
                placeholder="repo"
                value={project.deploy.githubRepo}
                onChange={(e) => saveDeploy("githubRepo", e.target.value)}
                aria-label="GitHub repo"
              />
              <Input
                placeholder="branch"
                className="w-28"
                value={project.deploy.githubBranch}
                onChange={(e) => saveDeploy("githubBranch", e.target.value)}
                aria-label="GitHub branch"
              />
            </div>
            <Button type="button" onClick={() => void pushGithub()} disabled={busy !== null}>
              {busy === "github" ? "Pushing…" : "Push repository"}
            </Button>
            {project.deploy.lastGithubUrl ? (
              <p className="truncate text-xs text-muted-foreground">{project.deploy.lastGithubUrl}</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl bg-card p-4 shadow-hairline">
          <div className="mb-3 flex items-center gap-2">
            <Cloud className="size-4 text-stone" />
            <h3 className="text-sm font-medium">Cloudflare Pages</h3>
          </div>
          <div className="flex flex-col gap-2">
            <Input
              placeholder="account id"
              value={project.deploy.cloudflareAccountId}
              onChange={(e) => saveDeploy("cloudflareAccountId", e.target.value)}
              aria-label="Cloudflare account id"
            />
            <Input
              placeholder="project name"
              value={project.deploy.cloudflareProject}
              onChange={(e) => saveDeploy("cloudflareProject", e.target.value)}
              aria-label="Cloudflare project name"
            />
            <Button type="button" onClick={() => void deployCloudflare()} disabled={busy !== null}>
              {busy === "cloudflare" ? "Deploying…" : "Deploy pages"}
            </Button>
            {project.deploy.lastCloudflareUrl ? (
              <p className="truncate text-xs text-muted-foreground">{project.deploy.lastCloudflareUrl}</p>
            ) : null}
          </div>
        </section>

        <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)}>
          <KeyRound className="size-4" />
          Tokens
        </Button>
      </div>
    </div>
  );
}
