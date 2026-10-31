/** Account-scoped inbox; notification delivery status and read_at are independent. */
const reply = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: {'cache-control':'private, no-store','x-content-type-options':'nosniff',...headers},
});
const inboxPrefix = '/api/notifications';
function writeAllowed(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  return (!origin || origin === url.origin) && (!fetchSite || fetchSite !== 'cross-site');
}
function validPath(path) {
  if (path === inboxPrefix || path === inboxPrefix+'/read-all') return true;
  return /^\/api\/notifications\/[a-zA-Z0-9_-]{1,128}\/read$/.test(path);
}
function project(row) {
  let data = {};
  try { const parsed=JSON.parse(row.data || '{}'); if(parsed && typeof parsed==='object' && !Array.isArray(parsed)) data=parsed; } catch {}
  const destination = typeof data.destination === 'string' && /^\/(?!\/)[a-zA-Z0-9/_?#=&.%-]{0,250}$/.test(data.destination)
    ? data.destination : null;
  return {
    id: String(row.id),title:String(row.subject || 'Notification'),message:String(row.message || ''),
    channel:String(row.channel),priority:String(row.priority || 'normal'),readAt:row.read_at ?? null,
    createdAt:Number(row.created_at),destination,
  };
}
export async function handleStudioNotifications(request, env, userId) {
  const url=new URL(request.url);
  if (!validPath(url.pathname)) return reply({ok:false,error:'not_found'},404);
  if (!userId) return reply({ok:false,error:'unauthorized'},401);
  if (!env.DB) return reply({ok:false,error:'notifications_unavailable',retryable:true},503);
  const owner="recipient_type='user' AND recipient_id=?";
  try {
    if (url.pathname === inboxPrefix && request.method === 'GET') {
      const requested=Number(url.searchParams.get('limit') || 20);
      const limit=Number.isFinite(requested)?Math.max(1,Math.min(50,Math.trunc(requested))):20;
      const result=await env.DB.prepare(`SELECT id,subject,message,channel,priority,data,read_at,created_at FROM notifications WHERE ${owner} ORDER BY created_at DESC,id DESC LIMIT ?`).bind(userId,limit).all();
      const count=await env.DB.prepare(`SELECT COUNT(*) AS unread FROM notifications WHERE ${owner} AND read_at IS NULL`).bind(userId).first();
      return reply({ok:true,unreadCount:Number(count?.unread || 0),notifications:(result.results||[]).map(project)});
    }
    if (request.method !== 'POST' || url.pathname === inboxPrefix) return reply({ok:false,error:'method_not_allowed'},405,{allow:url.pathname === inboxPrefix?'GET':'POST'});
    if (!writeAllowed(request)) return reply({ok:false,error:'origin_not_allowed'},403);
    if (url.pathname === inboxPrefix+'/read-all') {
      const result=await env.DB.prepare(`UPDATE notifications SET read_at=unixepoch() WHERE ${owner} AND read_at IS NULL`).bind(userId).run();
      return reply({ok:true,updated:Number(result.meta?.changes||0),unreadCount:0});
    }
    const id=decodeURIComponent(url.pathname.slice(inboxPrefix.length+1,-'/read'.length));
    const result=await env.DB.prepare(`UPDATE notifications SET read_at=COALESCE(read_at,unixepoch()) WHERE ${owner} AND id=?`).bind(userId,id).run();
    if (!result.meta?.changes) {
      const record=await env.DB.prepare(`SELECT id FROM notifications WHERE ${owner} AND id=?`).bind(userId,id).first();
      if (!record) return reply({ok:false,error:'not_found'},404);
    }
    const count=await env.DB.prepare(`SELECT COUNT(*) AS unread FROM notifications WHERE ${owner} AND read_at IS NULL`).bind(userId).first();
    return reply({ok:true,unreadCount:Number(count?.unread || 0)});
  } catch {
    return reply({ok:false,error:'notifications_unavailable',retryable:true},503);
  }
}
