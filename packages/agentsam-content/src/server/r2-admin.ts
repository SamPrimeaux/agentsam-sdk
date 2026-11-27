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

export interface R2AdminListOptions {
  cursor?: string;
  delimiter?: string;
  limit?: number;
}

export interface R2AdminListPage {
  bucket: string;
  prefix: string;
  delimiter: string;
  objects: R2AdminObject[];
  prefixes: string[];
  cursor: string | null;
  truncated: boolean;
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

  async function listR2ObjectsPage(
    prefix = "",
    options: R2AdminListOptions = {},
  ): Promise<R2AdminListPage> {
    if (!token) {
      throw new Error("Cloudflare R2 admin token required");
    }
    if (prefix.length > 1024) {
      throw new Error("R2 prefix exceeds 1024 characters");
    }

    const delimiter = options.delimiter === "" ? "" : String(options.delimiter ?? "/");
    if (delimiter !== "" && delimiter !== "/") {
      throw new Error("R2 delimiter must be '/' or an empty string");
    }
    const limit = Math.min(Math.max(Math.floor(Number(options.limit) || 100), 1), 1000);
    const cursor = String(options.cursor ?? "");

    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/r2/buckets/${encodeURIComponent(bucketName)}/objects`,
    );
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("per_page", String(limit));
    if (delimiter) url.searchParams.set("delimiter", delimiter);
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const body = await response.json() as {
      success?: boolean;
      errors?: unknown;
      result?: Array<{ key: string; size?: number; uploaded?: string }> | {
        objects?: Array<{ key: string; size?: number; uploaded?: string }>;
        cursor?: string;
        delimited?: string[];
      };
      result_info?: {
        cursor?: string;
        is_truncated?: boolean;
        truncated?: boolean;
        delimited?: string[];
      };
    };

    if (!response.ok || body.success === false) {
      throw new Error(`R2 list failed: ${JSON.stringify(body.errors || body)}`);
    }

    const result = body.result;
    const rows = Array.isArray(result) ? result : result?.objects || [];
    const info = body.result_info || {};
    const nextCursor = info.cursor || (!Array.isArray(result) ? result?.cursor : "") || null;
    const rawPrefixes = info.delimited || (!Array.isArray(result) ? result?.delimited : undefined) || [];

    return {
      bucket: bucketName,
      prefix,
      delimiter,
      objects: rows.map((object) => ({
        key: String(object.key || ""),
        size: Number(object.size || 0),
        uploaded: object.uploaded,
      })).filter((object) => object.key),
      prefixes: Array.isArray(rawPrefixes) ? rawPrefixes.filter((value): value is string => typeof value === "string" && value.length > 0) : [],
      cursor: nextCursor,
      truncated: Boolean(info.is_truncated ?? info.truncated ?? nextCursor),
    };
  }

  async function listR2Objects(prefix = ""): Promise<R2AdminObject[]> {
    const objects: R2AdminObject[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await listR2ObjectsPage(prefix, { delimiter: "", limit: 1000, cursor });
      objects.push(...page.objects);
      if (!page.truncated || !page.cursor) break;
      cursor = page.cursor;
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
    listR2ObjectsPage,
    downloadObjectToFile,
    putObjectFromFile,
    deleteR2Object,
  };
}
