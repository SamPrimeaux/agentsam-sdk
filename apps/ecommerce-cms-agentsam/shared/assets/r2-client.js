/**
 * FNF compatibility adapter.
 *
 * The generic Cloudflare R2 admin transport lives in
 * @inneranimalmedia/agentsam-content/server/r2-admin. This file only binds it
 * to this deployment's ASSET_STORAGE config (bucket, account, delivery URL).
 * Credentials are resolved by the transport (explicit token or server env);
 * shared app code does not read process.env.
 */
import { createCloudflareR2Admin } from "@inneranimalmedia/agentsam-content/server/r2-admin";
import { ASSET_STORAGE } from "./config.js";

const r2 = createCloudflareR2Admin({
  accountId: ASSET_STORAGE.accountId,
  bucketName: ASSET_STORAGE.bucket,
  downloadBaseUrl: ASSET_STORAGE.workerMediaBaseUrl,
});

export const listR2Objects = r2.listR2Objects;
export const downloadObjectToFile = r2.downloadObjectToFile;
export const putObjectFromFile = r2.putObjectFromFile;
export const deleteR2Object = r2.deleteR2Object;
