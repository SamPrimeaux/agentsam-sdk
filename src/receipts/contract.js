export const RECEIPT_ENVELOPE_SCHEMA = "agentsam.receipt.v1";
export const SCHEMA_BASE_URL = "https://schemas.inneranimalmedia.com";
export const SCHEMAS_BUCKET_NAME = "inneranimalmedia-schemas";
export const RECEIPT_SCHEMA_URL =
  `${SCHEMA_BASE_URL}/agentsam/schemas/agentsam.receipt.v1.json`;
export const RECEIPT_R2_PREFIX = "agentsam/runtime/receipts/v1";
export const BLOB_R2_PREFIX = "agentsam/runtime/blobs/sha256";

export function validateReceiptEnvelope(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== "object") {
    return { ok: false, errors: ["receipt must be an object"] };
  }
  if (receipt.schema !== RECEIPT_ENVELOPE_SCHEMA) {
    errors.push(`schema must be ${RECEIPT_ENVELOPE_SCHEMA}`);
  }
  if (!receipt.receipt_id) errors.push("receipt_id is required");
  if (!receipt.kind) errors.push("kind is required");
  if (!["passed", "failed", "skipped"].includes(receipt.status)) {
    errors.push("status must be passed, failed, or skipped");
  }
  if (
    !["ephemeral_success", "failure_bundle", "release_proof"].includes(
      receipt.retention_class,
    )
  ) {
    errors.push("retention_class is invalid");
  }
  if (!receipt.identity?.account_id) {
    errors.push("identity.account_id is required");
  }
  if (!Number.isFinite(Number(receipt.metrics?.created_at_unix))) {
    errors.push("metrics.created_at_unix is required");
  }
  for (const artifact of receipt.evidence?.artifacts || []) {
    if (
      artifact.r2_key &&
      !String(artifact.r2_key).startsWith(`${BLOB_R2_PREFIX}/`)
    ) {
      errors.push(
        `artifact r2_key must start with ${BLOB_R2_PREFIX}/`,
      );
    }
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}

export function receiptDatePrefix(receipt) {
  const unix = Number(receipt?.metrics?.created_at_unix);
  if (!Number.isFinite(unix) || unix < 0) {
    throw new TypeError("receipt.metrics.created_at_unix is required");
  }
  return new Date(unix * 1000).toISOString().slice(0, 10).replace(/-/g, "/");
}

export function receiptR2Key(receipt) {
  return `${RECEIPT_R2_PREFIX}/${receiptDatePrefix(receipt)}/${receipt.receipt_id}.json`;
}

export function retentionExpiresAt(receipt, nowUnix = Math.floor(Date.now() / 1000)) {
  if (receipt.retention_class === "ephemeral_success") {
    return nowUnix + 7 * 86400;
  }
  if (receipt.retention_class === "failure_bundle") {
    return nowUnix + 60 * 86400;
  }
  return null;
}
