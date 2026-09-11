import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const DeployBody = z.object({
  action: z.literal("deploy").optional(),
  token: z.string().min(8).max(200),
  accountId: z.string().min(8).max(80),
  projectName: z.string().min(1).max(80),
  files: z
    .array(z.object({ path: z.string().min(1).max(240), content: z.string().max(400_000) }))
    .min(1)
    .max(80),
  stream: z.boolean().optional(),
});

const WhoamiBody = z.object({
  action: z.literal("whoami"),
  token: z.string().min(8).max(200),
});

const StatusBody = z.object({
  action: z.literal("status"),
  token: z.string().min(8).max(200),
  accountId: z.string().min(8).max(80),
  projectName: z.string().min(1).max(80),
  deploymentId: z.string().min(1).max(120),
});

const CF = "https://api.cloudflare.com/client/v4";

async function cf(token: string, path: string, init?: RequestInit) {
  const res = await fetch(`${CF}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { errors: [{ message: text.slice(0, 240) }] };
  }
  return { ok: res.ok, status: res.status, json };
}

function cfError(json: unknown) {
  const errors = (json as { errors?: { message?: string }[] } | null)?.errors;
  return errors?.[0]?.message ?? "Cloudflare request failed";
}

function slugifyProject(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

type FeedDone =
  | { type: "done"; ok: true; url: string; id: string; project: string; files: number }
  | { type: "done"; ok: false; error: string };

type FeedEvent = { type: "log"; line: string } | FeedDone;

function encodeFeed(event: FeedEvent) {
  return `${JSON.stringify(event)}\n`;
}

export const Route = createFileRoute("/api/cloudflare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.json().catch(() => null);
        if (!raw || typeof raw !== "object") {
          return Response.json({ error: "Invalid Cloudflare request." }, { status: 400 });
        }

        const action = (raw as { action?: string }).action ?? "deploy";

        if (action === "whoami") {
          let parsed: z.infer<typeof WhoamiBody>;
          try {
            parsed = WhoamiBody.parse({ ...raw, action: "whoami" });
          } catch {
            return Response.json({ error: "Invalid whoami request." }, { status: 400 });
          }
          const verify = await cf(parsed.token, "/user/tokens/verify");
          if (!verify.ok) {
            return Response.json({ error: cfError(verify.json) }, { status: 401 });
          }
          const result = (verify.json as { result?: { status?: string; id?: string } } | null)?.result;
          return Response.json({
            ok: true,
            status: result?.status ?? "active",
            id: result?.id ?? "",
            line: `Authenticated · token ${result?.status ?? "ok"}${result?.id ? ` · ${result.id.slice(0, 8)}…` : ""}`,
          });
        }

        if (action === "status") {
          let parsed: z.infer<typeof StatusBody>;
          try {
            parsed = StatusBody.parse({ ...raw, action: "status" });
          } catch {
            return Response.json({ error: "Invalid status request." }, { status: 400 });
          }
          const slug = slugifyProject(parsed.projectName);
          const status = await cf(
            parsed.token,
            `/accounts/${parsed.accountId}/pages/projects/${slug}/deployments/${parsed.deploymentId}`,
          );
          if (!status.ok) {
            return Response.json({ error: cfError(status.json) }, { status: 502 });
          }
          const result = (
            status.json as {
              result?: {
                id?: string;
                url?: string;
                latest_stage?: { name?: string; status?: string };
                stages?: { name?: string; status?: string }[];
              };
            } | null
          )?.result;
          return Response.json({
            ok: true,
            id: result?.id ?? parsed.deploymentId,
            url: result?.url ?? "",
            stage: result?.latest_stage?.name ?? "",
            status: result?.latest_stage?.status ?? "",
            stages: result?.stages ?? [],
          });
        }

        let parsed: z.infer<typeof DeployBody>;
        try {
          parsed = DeployBody.parse({ ...raw, action: "deploy" });
        } catch {
          return Response.json({ error: "Invalid Cloudflare request." }, { status: 400 });
        }

        const { token, accountId, projectName, files } = parsed;
        const slug = slugifyProject(projectName);
        const wantStream = parsed.stream !== false;

        const runDeploy = async (emit: (event: FeedEvent) => void) => {
          emit({ type: "log", line: `wrangler feed · verifying token` });
          const verify = await cf(token, "/user/tokens/verify");
          if (!verify.ok) {
            emit({ type: "done", ok: false, error: cfError(verify.json) });
            return;
          }
          emit({ type: "log", line: `token ok` });

          emit({ type: "log", line: `checking Pages project ${slug}` });
          const existing = await cf(token, `/accounts/${accountId}/pages/projects/${slug}`);
          if (existing.status === 401 || existing.status === 403) {
            emit({ type: "done", ok: false, error: "Cloudflare rejected the token." });
            return;
          }
          if (!existing.ok) {
            emit({ type: "log", line: `creating project ${slug}` });
            const created = await cf(token, `/accounts/${accountId}/pages/projects`, {
              method: "POST",
              body: JSON.stringify({ name: slug, production_branch: "main" }),
            });
            if (!created.ok) {
              emit({ type: "done", ok: false, error: cfError(created.json) });
              return;
            }
            emit({ type: "log", line: `project created` });
          } else {
            emit({ type: "log", line: `project ready` });
          }

          emit({ type: "log", line: `uploading ${files.length} files…` });
          const form = new FormData();
          for (const file of files) {
            const path = file.path.replace(/^\/+/, "");
            form.append(path, new Blob([file.content], { type: "application/octet-stream" }), path);
          }

          const deployed = await cf(
            token,
            `/accounts/${accountId}/pages/projects/${slug}/deployments`,
            { method: "POST", body: form },
          );

          if (!deployed.ok) {
            emit({ type: "done", ok: false, error: cfError(deployed.json) });
            return;
          }

          const result = (
            deployed.json as { result?: { url?: string; id?: string; latest_stage?: { name?: string; status?: string } } } | null
          )?.result;
          const deploymentId = result?.id ?? "";
          let url = result?.url ?? `https://${slug}.pages.dev`;
          emit({
            type: "log",
            line: `upload accepted${deploymentId ? ` · ${deploymentId.slice(0, 10)}…` : ""}`,
          });

          if (deploymentId) {
            for (let i = 0; i < 24; i++) {
              await new Promise((r) => setTimeout(r, i === 0 ? 800 : 1500));
              const status = await cf(
                token,
                `/accounts/${accountId}/pages/projects/${slug}/deployments/${deploymentId}`,
              );
              if (!status.ok) {
                emit({ type: "log", line: `poll: ${cfError(status.json)}` });
                continue;
              }
              const body = (
                status.json as {
                  result?: {
                    url?: string;
                    latest_stage?: { name?: string; status?: string };
                    stages?: { name?: string; status?: string }[];
                  };
                } | null
              )?.result;
              if (body?.url) url = body.url;
              const stage = body?.latest_stage?.name ?? "deploy";
              const st = body?.latest_stage?.status ?? "unknown";
              emit({ type: "log", line: `${stage}: ${st}` });
              if (st === "success" || st === "failure" || st === "canceled") {
                if (st !== "success") {
                  emit({ type: "done", ok: false, error: `Deployment ${st} at stage ${stage}` });
                  return;
                }
                break;
              }
            }
          }

          emit({
            type: "done",
            ok: true,
            url,
            id: deploymentId,
            project: slug,
            files: files.length,
          });
        };

        if (!wantStream) {
          const logs: string[] = [];
          let url = "";
          let id = "";
          let project = "";
          let fileCount = 0;
          let error: string | null = null;
          let finished = false;
          await runDeploy((event) => {
            if (event.type === "log") {
              logs.push(event.line);
              return;
            }
            finished = true;
            if (event.ok) {
              url = event.url;
              id = event.id;
              project = event.project;
              fileCount = event.files;
            } else {
              error = event.error;
            }
          });
          if (error) {
            return Response.json({ error, logs }, { status: 502 });
          }
          if (!finished) {
            return Response.json({ error: "Deploy failed.", logs }, { status: 502 });
          }
          return Response.json({ ok: true, url, id, project, files: fileCount, logs });
        }

        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            try {
              await runDeploy((event) => {
                controller.enqueue(encoder.encode(encodeFeed(event)));
              });
            } catch (err) {
              controller.enqueue(
                encoder.encode(
                  encodeFeed({
                    type: "done",
                    ok: false,
                    error: err instanceof Error ? err.message : "Deploy failed",
                  }),
                ),
              );
            }
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
