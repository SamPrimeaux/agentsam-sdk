/** Read-only account notification history; the existing notifications table is authoritative. */
const reply = (body, status = 200, headers = {}) => Response.json(body, {
  status, headers: {'cache-control':'private, no-store','x-content-type-options':'nosniff',...headers},
});
export async function handleStudioNotifications(request, env, userId) {
  if (!userId) return reply({ok:false,error:'unauthorized'},401);
  if (request.method !== 'GET') return reply({ok:false,error:'method_not_allowed'},405,{allow:'GET'});
  if (!env.DB) return reply({ok:false,error:'notifications_unavailable',retryable:true},503);
  const requested = Number(new URL(request.url).searchParams.get('limit') || 20);
  const limit = Number.isFinite(requested) ? Math.max(1,Math.min(50,Math.trunc(requested))) : 20;
  try {
    const result = await env.DB.prepare(
      "SELECT id,subject,message,channel,status,read_at,created_at FROM notifications WHERE recipient_type='user' AND recipient_id=? ORDER BY created_at DESC,id DESC LIMIT ?"
    ).bind(userId,limit).all();
    return reply({ok:true,notifications:(result.results || []).map(row=>({
      id:String(row.id),title:String(row.subject || 'Notification'),message:String(row.message || ''),
      channel:String(row.channel),status:String(row.status),readAt:row.read_at || null,createdAt:row.created_at,
    }))});
  } catch {
    return reply({ok:false,error:'notifications_unavailable',retryable:true},503);
  }
}
