function jsonStringifySafe(value) {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(jsonStringifySafe(body), {
    status: Number(status) || 200,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
