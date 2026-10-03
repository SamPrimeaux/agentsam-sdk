import { runMerchCli } from "../../packages/agentsam-merch/src/cli.js";

export async function runMerch(args = []) {
  return runMerchCli(args);
}
