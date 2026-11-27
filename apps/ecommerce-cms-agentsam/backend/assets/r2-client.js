/**
 * Backend compatibility adapter for the canonical AgentSam R2 admin provider.
 * All list/prefix/cursor behavior lives in @inneranimalmedia/agentsam-content.
 * Resolve asset storage lazily because the Worker configures it at request startup.
 */
import { createCloudflareR2Admin } from "@inneranimalmedia/agentsam-content/server/r2-admin";
import { assetStorage } from "./config.js";

function r2() {
  const storage = assetStorage();
  return createCloudflareR2Admin({
    accountId: storage.accountId,
    bucketName: storage.bucket,
    downloadBaseUrl: storage.workerMediaBaseUrl,
  });
}

export async function listR2Objects(...args) {
  return r2().listR2Objects(...args);
}

export async function listR2ObjectsPage(...args) {
  return r2().listR2ObjectsPage(...args);
}

export async function downloadObjectToFile(...args) {
  return r2().downloadObjectToFile(...args);
}

export async function putObjectFromFile(...args) {
  return r2().putObjectFromFile(...args);
}

export async function deleteR2Object(...args) {
  return r2().deleteR2Object(...args);
}
