import { queryAgentSamToolUsage } from "@inneranimalmedia/agentsam-analytics/server";

/** Compatibility host adapter; query logic lives in agentsam-analytics. */
export async function queryAccountToolUsage(env, accountId, range = "30d") {
  return queryAgentSamToolUsage({ db: env?.DB, accountId }, range);
}
