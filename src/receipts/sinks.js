import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  RECEIPT_SCHEMA_URL,
  RECEIPT_R2_PREFIX,
  SCHEMA_BASE_URL,
  SCHEMAS_BUCKET_NAME,
  receiptR2Key,
  retentionExpiresAt,
  validateReceiptEnvelope,
} from "./contract.js";

function stablePayload(receipt) {
  return JSON.stringify(
    {
      $schema: RECEIPT_SCHEMA_URL,
      ...receipt,
    },
    null,
    2,
  );
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export class LocalReceiptSink {
  constructor({ baseDir = join(process.cwd(), ".agentsam", "receipts") } = {}) {
    this.baseDir = baseDir;
  }

  async write(receipt) {
    const validation = validateReceiptEnvelope(receipt);
    if (!validation.ok) {
      throw new TypeError(`Invalid AgentSam receipt: ${validation.errors.join("; ")}`);
    }
    const payload = stablePayload(receipt);
    const localPath = join(this.baseDir, `${receipt.receipt_id}.json`);
    await mkdir(dirname(localPath), { recursive: true });
    await writeFile(localPath, payload, "utf8");
    return {
      local_path: localPath,
      content_hash: sha256(payload),
      byte_size: Buffer.byteLength(payload),
    };
  }
}

export class R2ReceiptSink {
  constructor(env = {}) {
    this.env = env;
  }

  async write(receipt) {
    const validation = validateReceiptEnvelope(receipt);
    if (!validation.ok) {
      throw new TypeError(`Invalid AgentSam receipt: ${validation.errors.join("; ")}`);
    }

    const r2Key = receiptR2Key(receipt);
    if (!r2Key.startsWith(`${RECEIPT_R2_PREFIX}/`)) {
      throw new Error("receipt_key_prefix_violation");
    }

    const payload = stablePayload(receipt);
    const bucket = this.env.SCHEMAS_BUCKET;
    if (bucket) {
      await bucket.put(r2Key, payload, {
        httpMetadata: {
          contentType: "application/json",
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
    }

    return {
      r2_key: r2Key,
      url: `${SCHEMA_BASE_URL}/${r2Key}`,
      bucket: SCHEMAS_BUCKET_NAME,
      content_hash: sha256(payload),
      byte_size: Buffer.byteLength(payload),
      persisted: Boolean(bucket),
    };
  }
}

export class D1ReceiptCatalog {
  constructor(db) {
    if (!db?.prepare) throw new TypeError("D1ReceiptCatalog requires a D1-compatible DB");
    this.db = db;
  }

  async insertReceipt(receipt, sinkResult, { expiresAtUnix = null } = {}) {
    const r2Key = sinkResult?.r2_key;
    if (!r2Key?.startsWith(`${RECEIPT_R2_PREFIX}/`)) {
      throw new Error("receipt_catalog_r2_key_prefix_violation");
    }

    const payload = stablePayload(receipt);
    const contentHash = sinkResult.content_hash || sha256(payload);
    const byteSize = Number(sinkResult.byte_size || Buffer.byteLength(payload));

    await this.db
      .prepare(
        `INSERT INTO agentsam_receipt_catalog
          (id, account_id, receipt_kind, schema_name, status, retention_class,
           repository_id, git_sha, run_id, r2_key, content_hash, byte_size,
           created_at_unix, expires_at_unix, meta_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status=excluded.status,
           r2_key=excluded.r2_key,
           content_hash=excluded.content_hash,
           byte_size=excluded.byte_size,
           expires_at_unix=excluded.expires_at_unix,
           meta_json=excluded.meta_json`,
      )
      .bind(
        receipt.receipt_id,
        receipt.identity.account_id,
        receipt.kind,
        receipt.schema,
        receipt.status,
        receipt.retention_class,
        receipt.identity.repository_id || null,
        receipt.identity.git_sha || null,
        receipt.identity.run_id || null,
        r2Key,
        contentHash,
        byteSize,
        Number(receipt.metrics.created_at_unix),
        expiresAtUnix,
        JSON.stringify({
          pty_session_id: receipt.identity.pty_session_id || null,
          schema_url: RECEIPT_SCHEMA_URL,
        }),
      )
      .run();
  }

  async list({ limit = 20, repositoryId = null, status = null } = {}) {
    const where = [];
    const binds = [];
    if (repositoryId) {
      where.push("repository_id = ?");
      binds.push(String(repositoryId));
    }
    if (status) {
      where.push("status = ?");
      binds.push(String(status));
    }
    const boundedLimit = Math.max(1, Math.min(200, Number(limit) || 20));
    const sql =
      "SELECT id, account_id, receipt_kind, schema_name, status, retention_class, " +
      "repository_id, git_sha, run_id, r2_key, content_hash, byte_size, " +
      "created_at_unix, expires_at_unix, meta_json " +
      "FROM agentsam_receipt_catalog " +
      (where.length ? "WHERE " + where.join(" AND ") + " " : "") +
      "ORDER BY created_at_unix DESC LIMIT ?";
    binds.push(boundedLimit);
    const result = await this.db.prepare(sql).bind(...binds).all();
    return (result?.results || []).map((row) => ({
      receipt_id: row.id,
      kind: row.receipt_kind,
      schema: row.schema_name,
      status: row.status,
      retention_class: row.retention_class,
      identity: {
        account_id: row.account_id,
        repository_id: row.repository_id,
        git_sha: row.git_sha,
        run_id: row.run_id,
      },
      metrics: {
        created_at_unix: row.created_at_unix,
        receipt_byte_size: row.byte_size,
      },
      r2_key: row.r2_key,
      content_hash: row.content_hash,
      expires_at_unix: row.expires_at_unix,
      meta: row.meta_json ? JSON.parse(row.meta_json) : null,
    }));
  }

  async getIndex(receiptId) {
    const result = await this.db
      .prepare(
        "SELECT id, account_id, receipt_kind, schema_name, status, retention_class, " +
          "repository_id, git_sha, run_id, r2_key, content_hash, byte_size, " +
          "created_at_unix, expires_at_unix, meta_json " +
          "FROM agentsam_receipt_catalog WHERE id = ? LIMIT 1",
      )
      .bind(String(receiptId))
      .first();
    return result || null;
  }
}

export class ReceiptCatalogReader {
  constructor({ catalog, bucket }) {
    if (!catalog?.list || !catalog?.getIndex) {
      throw new TypeError("ReceiptCatalogReader requires a D1ReceiptCatalog-compatible catalog");
    }
    if (!bucket?.get) {
      throw new TypeError("ReceiptCatalogReader requires an R2-compatible bucket");
    }
    this.catalog = catalog;
    this.bucket = bucket;
  }

  async list(options = {}) {
    return this.catalog.list(options);
  }

  async get(receiptId) {
    const row = await this.catalog.getIndex(receiptId);
    if (!row) return null;
    if (!String(row.r2_key || "").startsWith(RECEIPT_R2_PREFIX + "/")) {
      throw new Error("receipt_catalog_r2_key_prefix_violation");
    }
    const object = await this.bucket.get(row.r2_key);
    if (!object) return null;
    const text =
      typeof object.text === "function"
        ? await object.text()
        : new TextDecoder().decode(await object.arrayBuffer());
    const receipt = JSON.parse(text);
    const validation = validateReceiptEnvelope(receipt);
    if (!validation.ok) {
      throw new Error("stored_receipt_envelope_invalid: " + validation.errors.join("; "));
    }
    return receipt;
  }
}

export class CompositeReceiptSink {
  constructor({ localSink, r2Sink = null, dbCatalog = null } = {}) {
    if (!localSink?.write) {
      throw new TypeError("CompositeReceiptSink requires localSink");
    }
    this.localSink = localSink;
    this.r2Sink = r2Sink;
    this.dbCatalog = dbCatalog;
  }

  async write(receipt, options = {}) {
    const validation = validateReceiptEnvelope(receipt);
    if (!validation.ok) {
      throw new TypeError(`Invalid AgentSam receipt: ${validation.errors.join("; ")}`);
    }

    const localRes = await this.localSink.write(receipt);
    let r2Res = {};
    const expiresAtUnix = retentionExpiresAt(receipt);

    if (this.r2Sink) {
      r2Res = await this.r2Sink.write(receipt);
      if (this.dbCatalog && r2Res.r2_key) {
        await this.dbCatalog.insertReceipt(receipt, r2Res, { expiresAtUnix });
      }
    }

    if (options.localWorkdir) {
      await this.cleanupLocalWorkspace(options.localWorkdir, receipt.status);
    }

    return {
      local_path: localRes.local_path,
      r2_key: r2Res.r2_key,
      url: r2Res.url,
      content_hash: r2Res.content_hash || localRes.content_hash,
      expires_at_unix: expiresAtUnix,
    };
  }

  async cleanupLocalWorkspace(workdir, status) {
    if (status !== "passed") return false;
    const value = String(workdir || "");
    if (!value || !value.includes("agentsam-")) return false;
    await rm(value, { recursive: true, force: true });
    return true;
  }
}
