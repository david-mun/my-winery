import { NextResponse } from "next/server";
import { z } from "zod";
import { readBody } from "@/lib/request-body";
import { lookupWine, type CatalogResult } from "@/lib/wine-catalog";

// Public read-only proxy, including /demo. Only product names leave this app.
const cache = new Map<string, { expires: number; value: CatalogResult }>();
let windowStart = 0,
  requests = 0,
  pending = 0;
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(req.url).origin, Reflect.get(process.env, "NEXT_PUBLIC_APP_URL")]);
  // Next dev can canonicalize 127.0.0.1 to localhost in Request.url.
  if (process.env.NODE_ENV === "development" && allowed.has("http://localhost:3000"))
    allowed.add("http://127.0.0.1:3000");
  if (!origin || !allowed.has(origin))
    return NextResponse.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  let query: string;
  try {
    const parsed = z
      .object({
        q: z
          .string()
          .trim()
          .min(2)
          .max(300)
          .regex(/^[^\r\n]+$/),
      })
      .strict()
      .parse(JSON.parse(new TextDecoder().decode(await readBody(req, 2048))));
    query = parsed.q;
  } catch {
    return NextResponse.json(
      { error: "검색할 상품명을 입력하세요." },
      { status: 400 },
    );
  }
  const now = Date.now(),
    cached = cache.get(query);
  if (cached && cached.expires > now) return NextResponse.json(cached.value);
  if (now - windowStart > 60000) {
    windowStart = now;
    requests = 0;
  }
  if (requests >= 40 || pending >= 5)
    return NextResponse.json(
      { error: "검색이 많습니다. 잠시 후 다시 시도하세요." },
      { status: 429 },
    );
  requests++;
  pending++;
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(20000)]);
    const result = await lookupWine(query, async (term) => {
      const url = new URL("https://www.eclavin.com/api/wines");
      url.searchParams.set("q", term);
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        redirect: "error",
        signal,
      });
      if (!res.ok) throw new Error("CATALOG_UNAVAILABLE");
      return res.json();
    });
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    cache.set(query, { value: result, expires: now + 300000 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        error:
          "공개 와인 검색에 연결하지 못했습니다. 영수증 상품명으로 저장할 수 있습니다.",
      },
      { status: 503 },
    );
  } finally {
    pending--;
  }
}
