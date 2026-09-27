import { createFileRoute } from "@tanstack/react-router";
import { optimizeWithScheduler } from "@inneranimalmedia/agentsam-sdk-brand";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Server-only image optimize bridge. sharp/libvips are Node-only —
 * MediaDropzone (browser) never imports agentsam-sdk-brand directly.
 * Called from ContentStudioPage's onAssetCreated hook after upload.
 */
export const Route = createFileRoute("/api/content/optimize")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => ({}));
        const { filename, mime, dataBase64, format } = body as {
          filename?: string;
          mime?: string;
          dataBase64?: string;
          format?: string;
        };
        if (!dataBase64 || !filename) {
          return Response.json({ ok: false, error: "filename_and_data_required" }, { status: 400 });
        }
        if (!mime || !mime.startsWith("image/")) {
          return Response.json({ ok: false, error: "not_an_image", skipped: true }, { status: 200 });
        }
        const repoRoot = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../../../../",
        );
        const outDir = path.join(repoRoot, ".agentsam", "content-library", "optimized");
        fs.mkdirSync(outDir, { recursive: true });

        const safeName = filename.replace(/[/\\]/g, "_").replace(/\.[^.]+$/, "");
        const outFormat = (format || "webp").toLowerCase();
        const outPath = path.join(outDir, `${safeName}-${Date.now()}.${outFormat}`);
        const inputBuffer = Buffer.from(dataBase64, "base64");
        try {
          const result = await optimizeWithScheduler(inputBuffer, {
            format: outFormat,
            outPath,
          });
          const ref = path.relative(repoRoot, result.path);
          return Response.json({
            ok: true,
            ref,
            format: result.format,
            bytes: result.bytes,
            width: result.width,
            height: result.height,
            processor: result.processor,
          });
        } catch (error) {
          return Response.json(
            { ok: false, error: error instanceof Error ? error.message : String(error) },
            { status: 500 },
          );
        }
      },
    },
  },
});
