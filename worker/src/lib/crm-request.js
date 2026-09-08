export async function readCrmJson(request, maxBytes = 65536) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new TypeError('request_too_large');
  if (!request.body) throw new TypeError('invalid_body');
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new TypeError('request_too_large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid_body');
  return value;
}
