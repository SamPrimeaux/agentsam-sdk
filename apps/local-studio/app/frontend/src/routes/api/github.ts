import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  token: z.string().min(8).max(200),
  owner: z.string().min(1).max(80),
  repo: z.string().min(1).max(80),
  branch: z.string().min(1).max(80).default("main"),
  message: z.string().min(1).max(240),
  private: z.boolean().optional(),
  files: z
    .array(z.object({ path: z.string().min(1).max(240), content: z.string().max(400_000) }))
    .min(1)
    .max(80),
});

const GH = "https://api.github.com";

async function gh(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${GH}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "AgentSam-Work",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { message: text.slice(0, 240) };
  }
  return { ok: res.ok, status: res.status, json };
}

export const Route = createFileRoute("/api/github")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid GitHub request." }, { status: 400 });
        }

        const { token, owner, repo, branch, message, files } = parsed;

        const existing = await gh(token, `/repos/${owner}/${repo}`);
        if (existing.status === 401 || existing.status === 403) {
          return Response.json({ error: "GitHub rejected the token." }, { status: 401 });
        }
        if (existing.status === 404) {
          const created = await gh(token, "/user/repos", {
            method: "POST",
            body: JSON.stringify({
              name: repo,
              private: parsed.private ?? true,
              description: "Shipped from AgentSam Work",
              auto_init: false,
            }),
          });
          if (!created.ok) {
            const org = await gh(token, `/orgs/${owner}/repos`, {
              method: "POST",
              body: JSON.stringify({
                name: repo,
                private: parsed.private ?? true,
                description: "Shipped from AgentSam Work",
                auto_init: false,
              }),
            });
            if (!org.ok) {
              const detail = (created.json as { message?: string } | null)?.message ?? "could not create repo";
              return Response.json({ error: `GitHub create failed: ${detail}` }, { status: 502 });
            }
          }
        }

        const blobs: { path: string; sha: string }[] = [];
        for (const file of files) {
          const blob = await gh(token, `/repos/${owner}/${repo}/git/blobs`, {
            method: "POST",
            body: JSON.stringify({ content: file.content, encoding: "utf-8" }),
          });
          const sha = (blob.json as { sha?: string } | null)?.sha;
          if (!blob.ok || !sha) {
            return Response.json({ error: `Could not write ${file.path}` }, { status: 502 });
          }
          blobs.push({ path: file.path.replace(/^\/+/, ""), sha });
        }

        const ref = await gh(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`);
        const refSha = (ref.json as { object?: { sha?: string } } | null)?.object?.sha;
        let parentSha: string | undefined;
        let baseTree: string | undefined;
        if (ref.ok && refSha) {
          parentSha = refSha;
          const commit = await gh(token, `/repos/${owner}/${repo}/git/commits/${refSha}`);
          baseTree = (commit.json as { tree?: { sha?: string } } | null)?.tree?.sha;
        }

        const tree = await gh(token, `/repos/${owner}/${repo}/git/trees`, {
          method: "POST",
          body: JSON.stringify({
            base_tree: baseTree,
            tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
          }),
        });
        const treeSha = (tree.json as { sha?: string } | null)?.sha;
        if (!tree.ok || !treeSha) {
          return Response.json({ error: "Could not build git tree." }, { status: 502 });
        }

        const commit = await gh(token, `/repos/${owner}/${repo}/git/commits`, {
          method: "POST",
          body: JSON.stringify({
            message,
            tree: treeSha,
            parents: parentSha ? [parentSha] : [],
          }),
        });
        const commitSha = (commit.json as { sha?: string } | null)?.sha;
        if (!commit.ok || !commitSha) {
          return Response.json({ error: "Could not create commit." }, { status: 502 });
        }

        if (parentSha) {
          const updated = await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
            method: "PATCH",
            body: JSON.stringify({ sha: commitSha }),
          });
          if (!updated.ok) {
            return Response.json({ error: "Could not update branch." }, { status: 502 });
          }
        } else {
          const createdRef = await gh(token, `/repos/${owner}/${repo}/git/refs`, {
            method: "POST",
            body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha }),
          });
          if (!createdRef.ok) {
            return Response.json({ error: "Could not create branch." }, { status: 502 });
          }
        }

        const url = `https://github.com/${owner}/${repo}`;
        return Response.json({ ok: true, url, sha: commitSha, files: blobs.length });
      },
    },
  },
});
