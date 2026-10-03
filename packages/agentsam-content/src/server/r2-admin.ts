import { spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export type R2AdminFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface R2AdminEnv {
  CLOUDFLARE_API_TOKEN?: string;
  CF_API_TOKEN?: string;
  [key: string]: string | undefined;
}

export interface CloudflareR2AdminConfig {
  accountId: string;
  bucketName: string;

  /**
   * Optional HTTP delivery path used for downloads.
   * Example: https://example.com/media
   */
  downloadBaseUrl?: string;

  /**
   * Explicit credential wins over env.
   * Apps may inject vault/delegated credentials instead.
   */
  apiToken?: string;

  /**
   * Injectable env bag for CLI/server runtimes and tests.
   * Defaults to process.env only inside this server-only module.
   */
  env?: R2AdminEnv;

  /**
   * Injectable fetch for tests/custom runtimes.
   */
  fetch?: R2AdminFetch;

  /**
   * Default cwd for Wrangler subprocesses.
   */
  cwd?: string;
}

export interface R2AdminObject {
  key: string;
  size: number;
  uploaded?: string;
}

export interface R2AdminMutationOptions {
  cwd?: string;
  dryRun?: boolean;
}

export function resolveCloudflareR2AdminToken(
  env: R2AdminEnv = process.env as R2AdminEnv,
): string {
  return String(
    env.CLOUDFLARE_API_TOKEN ||
    env.CF_API_TOKEN ||
    "",
  ).trim();
}

function cleanBaseUrl(value: string | undefined): string {
  return String(value || "").replace(/\/+$/, "");
}

function cleanKey(value: string): string {
  return String(value || "").replace(/^\/+/, "");
}

export function createCloudflareR2Admin(
  config: CloudflareR2AdminConfig,
) {
  const accountId = String(config.accountId || "").trim();
  const bucketName = String(config.bucketName || "").trim();

  if (!accountId) {
    throw new Error("createCloudflareR2Admin: accountId required");
  }

  if (!bucketName) {
    throw new Error("createCloudflareR2Admin: bucketName required");
  }

  const env =
    config.env ??
    (process.env as R2AdminEnv);

  const token =
    String(config.apiToken || "").trim() ||
    resolveCloudflareR2AdminToken(env);

  const fetchImpl: R2AdminFetch =
    config.fetch ??
    ((input, init) => fetch(input, init));

  const downloadBaseUrl =
    cleanBaseUrl(config.downloadBaseUrl);

  const subprocessEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...env,
  };

  // Preserve existing Wrangler auth behavior while allowing callers
  // to inject credentials without mutating process.env.
  if (
    token &&
    !subprocessEnv.CLOUDFLARE_API_TOKEN &&
    !subprocessEnv.CF_API_TOKEN
  ) {
    subprocessEnv.CLOUDFLARE_API_TOKEN = token;
  }

  async function listR2Objects(
    prefix = "",
  ): Promise<R2AdminObject[]> {
    if (!token) {
      throw new Error(
        "Cloudflare R2 admin token required",
      );
    }

    const objects: R2AdminObject[] = [];
    let cursor = "";

    for (;;) {
      const url = new URL(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`,
      );

      url.searchParams.set("prefix", prefix);
      url.searchParams.set("per_page", "1000");

      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const res = await fetchImpl(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const body = await res.json() as {
        success?: boolean;
        errors?: unknown;
        result?:
          | Array<{
              key: string;
              size?: number;
              uploaded?: string;
            }>
          | {
              objects?: Array<{
                key: string;
                size?: number;
                uploaded?: string;
              }>;
              cursor?: string;
            };
        result_info?: {
          cursor?: string;
        };
      };

      if (!body.success) {
        throw new Error(
          `R2 list failed: ${JSON.stringify(
            body.errors || body,
          )}`,
        );
      }

      const rows = Array.isArray(body.result)
        ? body.result
        : body.result?.objects || [];

      objects.push(
        ...rows.map((object) => ({
          key: object.key,
          size: Number(object.size || 0),
          uploaded: object.uploaded,
        })),
      );

      cursor =
        body.result_info?.cursor ||
        (!Array.isArray(body.result)
          ? body.result?.cursor
          : "") ||
        "";

      if (!cursor || rows.length === 0) {
        break;
      }
    }

    return objects;
  }

  async function downloadObjectToFile(
    key: string,
    destinationPath: string,
  ): Promise<string> {
    if (!downloadBaseUrl) {
      throw new Error(
        "downloadObjectToFile requires downloadBaseUrl",
      );
    }

    const clean = cleanKey(key);

    const encodedKey = clean
      .split("/")
      .map(encodeURIComponent)
      .join("/");

    const url =
      `${downloadBaseUrl}/${encodedKey}`;

    const response =
      await fetchImpl(url);

    if (!response.ok || !response.body) {
      throw new Error(
        `download ${clean} → HTTP ${response.status}`,
      );
    }

    await pipeline(
      Readable.fromWeb(response.body as never),
      createWriteStream(destinationPath),
    );

    return destinationPath;
  }

  function runWrangler(
    args: string[],
    cwd?: string,
  ) {
    return spawnSync(
      "npx",
      args,
      {
        cwd:
          cwd ||
          config.cwd ||
          process.cwd(),
        encoding: "utf8",
        env: subprocessEnv,
      },
    );
  }

  function putObjectFromFile(
    key: string,
    filePath: string,
    contentType: string,
    customMetadata: Record<string, string> = {},
    opts: R2AdminMutationOptions = {},
  ) {
    const clean = cleanKey(key);

    if (opts.dryRun) {
      return {
        ok: true,
        dry_run: true,
        key: clean,
      };
    }

    const baseArgs = [
      "wrangler",
      "r2",
      "object",
      "put",
      `${bucketName}/${clean}`,
      "--file",
      filePath,
      "--content-type",
      contentType,
      "--remote",
    ];

    let args = [...baseArgs];

    if (
      customMetadata &&
      Object.keys(customMetadata).length
    ) {
      args.push(
        "--custom-metadata",
        JSON.stringify(customMetadata),
      );
    }

    let result =
      runWrangler(args, opts.cwd);

    if (
      result.status !== 0 &&
      String(
        result.stderr ||
        result.stdout ||
        "",
      ).match(
        /custom-metadata|Unknown argument/i,
      )
    ) {
      result =
        runWrangler(baseArgs, opts.cwd);

      if (result.status !== 0) {
        throw new Error(
          `wrangler put ${clean}: ${
            result.stderr ||
            result.stdout
          }`,
        );
      }

      return {
        ok: true,
        key: clean,
        metadata_deferred:
          customMetadata,
      };
    }

    if (result.status !== 0) {
      throw new Error(
        `wrangler put ${clean}: ${
          result.stderr ||
          result.stdout
        }`,
      );
    }

    return {
      ok: true,
      key: clean,
      metadata: customMetadata,
    };
  }

  function deleteR2Object(
    key: string,
    opts: R2AdminMutationOptions = {},
  ) {
    const clean = cleanKey(key);

    if (!clean) {
      throw new Error(
        "deleteR2Object: key required",
      );
    }

    if (opts.dryRun) {
      return {
        ok: true,
        dry_run: true,
        key: clean,
      };
    }

    const result = runWrangler(
      [
        "wrangler",
        "r2",
        "object",
        "delete",
        `${bucketName}/${clean}`,
        "--remote",
      ],
      opts.cwd,
    );

    if (result.status !== 0) {
      throw new Error(
        `wrangler delete ${clean}: ${
          result.stderr ||
          result.stdout
        }`,
      );
    }

    return {
      ok: true,
      key: clean,
      deleted: true,
    };
  }

  return {
    listR2Objects,
    downloadObjectToFile,
    putObjectFromFile,
    deleteR2Object,
  };
}
