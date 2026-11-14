import "server-only";
import type { Collection } from "./domain";
import type { supabase } from "./supabase/server";
export async function collection(
  db: Awaited<ReturnType<typeof supabase>>,
): Promise<Collection> {
  const tables = [
    "wines",
    "tasting_notes",
    "external_ratings",
    "purchase_receipts",
    "receipt_lines",
    "receipt_line_wines",
    "merchants",
    "media_assets",
  ];
  const results = await Promise.all(
    tables.map((t) => db.from(t).select("*").limit(10000)),
  );
  if (results.some((r) => r.error))
    throw new Error(
      "자료를 불러오지 못했습니다. DB 마이그레이션과 연결을 확인해 주세요.",
    );
  const [wines, notes, ratings, receipts, lines, links, merchants, assets] =
    results.map((r) =>
      (r.data ?? []).map((row) => {
        const copy = { ...row } as Record<string, unknown>;
        for (const key of [
          "my_rating",
          "score",
          "paid_amount",
          "discount_amount",
          "gross_items_amount",
          "bundle_amount",
          "line_amount",
          "allocated_amount",
          "bottle_quantity",
          "version",
          "source_row",
          "line_no",
        ]) {
          if (copy[key] != null) {
            const n = Number(copy[key]);
            if (!Number.isFinite(n)) throw new Error("유효하지 않은 숫자 응답");
            copy[key] = n;
          }
        }
        for (const key of ["purchased_on", "tasted_on", "checked_on"])
          if (typeof copy[key] === "string") copy[key] = copy[key].slice(0, 10);
        return copy;
      }),
    );
  return {
    wines,
    notes,
    ratings,
    receipts,
    lines,
    links,
    merchants,
    assets: assets.sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    ),
  } as Collection;
}
