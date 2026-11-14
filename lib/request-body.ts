export async function readBody(req: Request | Response, limit: number) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) throw new Error("BODY_TOO_LARGE");
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("BODY_TOO_LARGE");
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}
export async function readJson(req: Request) {
  const bytes = await readBody(req, 512 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("INVALID_JSON");
  }
}
export async function readImageForm(req: Request) {
  const bytes = await readBody(req, 4_250_000);
  return new Response(bytes.buffer, {
    headers: { "Content-Type": req.headers.get("content-type") ?? "" },
  }).formData();
}
