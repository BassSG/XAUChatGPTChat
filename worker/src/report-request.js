// V4.3 includes structural evidence and a dated flow history. Bound actual UTF-8
// bytes as well as Content-Length; the authenticated JSON upload stays finite.
export const MAX_REPORT_BYTES = 256_000;

export async function readReportRequest(request) {
  const tooLarge = () => Object.assign(new Error('Report payload is too large.'), { status: 413 });
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > MAX_REPORT_BYTES) throw tooLarge();
  if (!request.body) return null;
  const reader = request.body.getReader(), chunks = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REPORT_BYTES) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { return null; }
}
