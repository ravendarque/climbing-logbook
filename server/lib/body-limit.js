import { BODY_LIMITS } from "../../shared/field-limits.js";
import { json } from "./json.js";

const IMPORT_PATH = "/-/api/entries/import";

function tooLarge(limit) {
  const size = limit >= 1024 * 1024 ? `${limit / (1024 * 1024)} MB` : `${limit / 1024} KB`;
  const message = `That's too much to send at once: the limit is ${size}.`;
  return json({ error: message, message }, 413);
}

// Read under a byte cap before any route parses it, so a huge body costs nothing first (#1044).
// The header is checked first, then the bytes are counted, so a missing or false Content-Length can't get past it.
export async function capRequestBody(request) {
  if (!request.body) return request;
  const limit = new URL(request.url).pathname === IMPORT_PATH ? BODY_LIMITS.import : BODY_LIMITS.json;
  if (Number(request.headers.get("Content-Length")) > limit) return tooLarge(limit);

  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return tooLarge(limit);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request, { body });
}
