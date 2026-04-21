export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    status: init.status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

export function jsonError(status, message, extra = {}) {
  return json({ ok: false, error: message, ...extra }, { status });
}

export function jsonOk(data = {}) {
  return json({ ok: true, ...data });
}
