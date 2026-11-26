import { emitAnalyticsFact } from "./analytics-service.js";

const headers = {"cache-control":"private, no-store, max-age=0",vary:"Cookie"};
const response = (status, body) => ({status, headers, body});
const keys = ["dependency_count","checked_count","ast_files","browser_reachable_files","browser_roots","finding_count","vulnerability_count","boundary_count"];
const hash = /^sha256:[a-f0-9]{64}$/i;
const statuses = new Set(["clean","action-required","incomplete"]);

export function normalizeSecuritySummary(input) {
  if (!input || input.scanner !== "agentsam-sca" || input.schema_version !== 1 || !statuses.has(input.status)) throw new TypeError("invalid_security_report");
  const checkedAt = Date.parse(input.checked_at);
  if (!Number.isFinite(checkedAt) || checkedAt > Date.now()+300000 || checkedAt < 0) throw new TypeError("invalid_scan_timestamp");
  if (typeof input.dependency_complete !== "boolean" || typeof input.boundary_complete !== "boolean") throw new TypeError("invalid_coverage");
  const metrics = {};
  for (const k of keys) {
    if (!Number.isSafeInteger(input[k]) || input[k] < 0) throw new TypeError("invalid_scan_metric");
    metrics[k] = input[k];
  }
  if (metrics.checked_count > metrics.dependency_count || metrics.vulnerability_count + metrics.boundary_count > metrics.finding_count ||
      (input.dependency_complete && metrics.checked_count !== metrics.dependency_count)) throw new TypeError("inconsistent_scan_metrics");
  const expected = !input.dependency_complete || !input.boundary_complete ? "incomplete" : metrics.finding_count ? "action-required" : "clean";
  if (input.status !== expected) throw new TypeError("inconsistent_scan_status");
  if (!hash.test(input.merkle_root) || !hash.test(input.metadata_root)) throw new TypeError("invalid_scan_evidence");
  const repository = typeof input.repository === "string" ? input.repository.trim() : "";
  if (!repository || repository.length > 160 || !/^[a-zA-Z0-9_.:/-]+$/.test(repository)) throw new TypeError("repository_label_required");
  return {checkedAt, repository, outcome:input.status, dimensions:{scanner:"agentsam-sca",provenance:"user_imported",dependency_complete:input.dependency_complete,boundary_complete:input.boundary_complete,merkle_root:input.merkle_root,metadata_root:input.metadata_root},metrics};
}

export async function handleSecurityAnalytics(request, env, accountId) {
  try {
    if (request.method === "POST") {
      // Imports are explicit authenticated browser actions, not trusted runtime attestations.
      if (request.headers.get("origin") !== new URL(request.url).origin) return response(403,{ok:false,error:"same_origin_required"});
      if (!request.headers.get("content-type")?.startsWith("application/json")) return response(415,{ok:false,error:"json_required"});
      if (Number(request.headers.get("content-length")) > 8192) return response(413,{ok:false,error:"summary_too_large"});
      const reader = request.body?.getReader();
      if (!reader) return response(400,{ok:false,error:"summary_required"});
      const chunks = []; let total = 0;
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > 8192) { await reader.cancel(); return response(413,{ok:false,error:"summary_too_large"}); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let summary;
      try { summary = normalizeSecuritySummary(JSON.parse(new TextDecoder().decode(bytes))); }
      catch { return response(400,{ok:false,error:"invalid_security_summary"}); }
      const {checkedAt,repository,outcome,dimensions,metrics} = summary;
      const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify([accountId,summary])));
      const id = "sec_"+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
      const exists = () => env.DB.prepare("SELECT id FROM agentsam_analytics WHERE account_id = ? AND id = ?").bind(accountId,id).first();
      if (await exists()) return response(200,{ok:true,id,duplicate:true});
      try {
        const saved = await emitAnalyticsFact(env,accountId,{id,event_kind:"assessment",domain:"security",operation:"security.scan",outcome,repository_id:repository,source_client:"user_imported",created_at_unix:Math.floor(checkedAt/1000),dimensions,metrics});
        return response(201,{ok:true,id,basin:saved.basin});
      } catch (error) {
        if (await exists()) return response(200,{ok:true,id,duplicate:true});
        throw error;
      }
    }
    if (request.method !== "GET") return response(405,{ok:false,error:"method_not_allowed"});
    const url = new URL(request.url);
    const range = (url.searchParams.get("range") || "30d").toLowerCase();
    const days = {"24h":1,"7d":7,"30d":30,"90d":90,"1y":365,"365d":365};
    const now = new Date();
    const since = range === "ytd" ? Date.UTC(now.getUTCFullYear(),0,1)/1000 : range === "all" ? 0 : Math.floor(Date.now()/1000-(days[range]||30)*86400);
    const result = await env.DB.prepare("SELECT id, repository_id, git_sha, outcome, source_client, created_at_unix, dimensions_json, metrics_json FROM agentsam_analytics WHERE account_id = ? AND domain = 'security' AND operation = 'security.scan' AND created_at_unix >= ? ORDER BY created_at_unix DESC, id DESC LIMIT 100").bind(accountId,since).all();
    const scans = (result.results||[]).map(row=>({id:row.id,repository:row.repository_id,git_sha:row.git_sha,status:row.outcome,source:row.source_client,checked_at:new Date(row.created_at_unix*1000).toISOString(),dimensions:JSON.parse(row.dimensions_json||"{}"),metrics:JSON.parse(row.metrics_json||"{}")}));
    return response(200,{ok:true,range,scans,limit:100,source:"agentsam_analytics"});
  } catch { return response(503,{ok:false,error:"security_analytics_unavailable"}); }
}
