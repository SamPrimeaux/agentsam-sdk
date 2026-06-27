export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  });
}

export function notFound() {
  return json({ ok: false, error: 'not_found' }, 404);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
