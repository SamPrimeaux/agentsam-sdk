import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  pruneLocalWorkspaces,
  validateReceiptEnvelope,
} from "../receipts/index.js";

function intFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? Number.parseInt(args[index + 1], 10) : NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function numberFlag(args, flag, fallback) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? Number(args[index + 1]) : NaN;
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function stringFlag(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : null;
}

async function readLocalReceipts(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const receipts = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const value = JSON.parse(
        await readFile(path.join(directory, entry.name), "utf8"),
      );
      if (validateReceiptEnvelope(value).ok) receipts.push(value);
    } catch {}
  }
  receipts.sort(
    (a, b) =>
      Number(b.metrics?.created_at_unix || 0) -
      Number(a.metrics?.created_at_unix || 0),
  );
  return receipts;
}

function writeSummary(receipt) {
  const date = new Date(
    Number(receipt.metrics?.created_at_unix || 0) * 1000,
  ).toISOString();
  process.stdout.write(
    [
      receipt.receipt_id,
      receipt.status,
      receipt.kind,
      date,
      receipt.identity?.repository_id || "-",
    ].join("\t") + "\n",
  );
}

export async function runReceipts(args = [], options = {}) {
  const [command = "list", ...rest] = args;
  const localDir =
    options.localDir ||
    stringFlag(rest, "--dir") ||
    path.join(process.cwd(), ".agentsam", "receipts");

  if (command === "prune") {
    const result = await pruneLocalWorkspaces({
      maxTmpGb: numberFlag(rest, "--max-tmp-gb", 1),
      dryRun: rest.includes("--dry-run"),
    });
    if (rest.includes("--json")) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      process.stdout.write(
        "Scanned " +
          result.scannedCount +
          " AgentSam workdirs; purged " +
          result.purgedCount +
          "; " +
          result.remainingBytes +
          " bytes remain.\n",
      );
    }
    return result;
  }

  const receipts = options.catalog
    ? await options.catalog.list({
        limit: intFlag(rest, "--limit", 20),
        repositoryId: stringFlag(rest, "--repo"),
        status: command === "failures" ? "failed" : undefined,
      })
    : await readLocalReceipts(localDir);

  if (command === "show") {
    const id = rest.find((arg) => !arg.startsWith("--"));
    if (!id) throw new Error("agentsam receipts show requires a receipt id");
    const receipt = options.catalog
      ? await options.catalog.get(id)
      : receipts.find((item) => item.receipt_id === id);
    if (!receipt) {
      const error = new Error("Receipt not found: " + id);
      error.code = "AGENTSAM_RECEIPT_NOT_FOUND";
      throw error;
    }
    process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  }

  if (!["list", "failures"].includes(command)) {
    throw new Error(
      "Usage: agentsam receipts list [--limit 20] [--repo <id>]\n" +
        "       agentsam receipts show <receipt-id>\n" +
        "       agentsam receipts failures [--repo <id>]\n" +
        "       agentsam receipts prune [--max-tmp-gb 1.0] [--dry-run]",
    );
  }

  const repo = stringFlag(rest, "--repo");
  const limit = intFlag(rest, "--limit", 20);
  const filtered = receipts
    .filter((receipt) => !repo || receipt.identity?.repository_id === repo)
    .filter((receipt) => command !== "failures" || receipt.status === "failed")
    .slice(0, limit);

  if (rest.includes("--json")) {
    process.stdout.write(JSON.stringify(filtered, null, 2) + "\n");
  } else {
    if (!options.catalog) {
      process.stderr.write(
        "  source: local receipt cache (" +
          localDir +
          "); durable D1 catalog requires a host catalog adapter\n",
      );
    }
    for (const receipt of filtered) writeSummary(receipt);
  }
  return filtered;
}
