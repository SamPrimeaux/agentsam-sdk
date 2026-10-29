const ALLOWED_STATUSES = new Set(["pending", "subscribed", "unsubscribed", "bounced", "complained"]);

/** Query the lifecycle-aware subscriber list. The caller owns admin authentication and response headers. */
export async function queryNewsletterSubscribers(env, url) {
  const requestedStatus = url.searchParams.get("status") || "all";
  const search = (url.searchParams.get("q") || "").trim().slice(0, 120).toLowerCase();
  const where = [];
  const params = [];
  if (ALLOWED_STATUSES.has(requestedStatus)) {
    where.push("status = ?");
    params.push(requestedStatus);
  }
  if (search) {
    const term = `%${search}%`;
    where.push("(lower(email) LIKE ? OR lower(coalesce(first_name, '')) LIKE ? OR lower(coalesce(last_name, '')) LIKE ? OR lower(coalesce(source_path, '')) LIKE ?)");
    params.push(term, term, term, term);
  }
  const predicate = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const statement = env.DB.prepare(`SELECT id, email, first_name, last_name, status, source_type,
      source_ref, source_path, source_path AS source_page, attribution_json, consent_text,
      confirmed_at, subscribed_at, unsubscribed_at, tags_json, created_at, updated_at, last_event_at,
      provider_contact_id
    FROM newsletter_subscribers ${predicate} ORDER BY created_at DESC LIMIT 1000`);
  const { results } = await (params.length ? statement.bind(...params) : statement).all();
  const { results: statusRows } = await env.DB.prepare(
    "SELECT status, COUNT(*) AS n FROM newsletter_subscribers GROUP BY status"
  ).all();
  const summary = { total: 0, pending: 0, subscribed: 0, unsubscribed: 0, bounced: 0, complained: 0 };
  for (const row of statusRows || []) {
    if (Object.hasOwn(summary, row.status) && row.status !== "total") summary[row.status] = Number(row.n) || 0;
    summary.total += Number(row.n) || 0;
  }
  return { subscribers: results || [], summary };
}
