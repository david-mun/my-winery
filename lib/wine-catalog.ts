export type CatalogWine = {
  id: string;
  name: string;
  original: string | null;
  producer: string | null;
  country: string | null;
};
export type CatalogResult = {
  candidates: CatalogWine[];
  exactId: string | null;
};
const compact = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function searchTerms(label: string) {
  const cleaned = label
    .normalize("NFKC")
    .replace(/^\s*(?:\(p\)|"p"|\[[^\]]{1,18}\])\s*/i, "")
    .replace(/\s*\d+(?:\.\d+)?\s*(?:ml|cl|ℓ|l)\s*$/i, "")
    .replace(/(?<=[가-힣])\s*(?:20)?\d{2}\s*$/, "")
    .trim();
  const words = cleaned.split(/\s+/);
  // Only broaden after a miss. A short brand fragment helps with joined POS names.
  const brand = words[0]?.slice(0, 2);
  return [
    ...new Set([
      cleaned,
      words.slice(0, 2).join(" "),
      words[0],
      brand && /^[가-힣]{2}$/.test(brand) ? brand : "",
    ]),
  ].filter((s) => compact(s).length >= 2);
}
function grams(s: string) {
  return new Set(
    Array.from({ length: Math.max(0, s.length - 1) }, (_, i) =>
      s.slice(i, i + 2),
    ),
  );
}
export async function lookupWine(
  label: string,
  call: (term: string) => Promise<unknown>,
): Promise<CatalogResult> {
  const terms = searchTerms(label);
  const query = compact(terms[0] ?? "");
  for (const term of terms) {
    const raw = await call(term);
    if (
      !raw ||
      typeof raw !== "object" ||
      !("items" in raw) ||
      !Array.isArray(raw.items)
    )
      throw new Error("CATALOG_RESPONSE");
    const candidates = new Map<
      string,
      { wine: CatalogWine; score: number; exact: boolean }
    >();
    const qgrams = grams(query);
    for (const row of raw.items.slice(0, 100)) {
      if (
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !/^[\w-]{1,100}$/.test(row.id)
      )
        continue;
      const field = (v: unknown) =>
        typeof v === "string" && v.trim() && v.length <= 200 ? v.trim() : null;
      const original = field(row.name_en),
        name = field(row.name_ko) ?? original;
      if (!name) continue;
      const names = [name, original ?? ""].map(compact).filter(Boolean);
      const exact = names.includes(query);
      const score = Math.max(
        ...names.map((n) => {
          const set = grams(n),
            hits = [...qgrams].filter((x) => set.has(x)).length;
          return n === query
            ? 3
            : n.includes(query) || query.includes(n)
              ? 1 +
                Math.min(n.length, query.length) /
                  Math.max(n.length, query.length)
              : (2 * hits) / (qgrams.size + set.size || 1);
        }),
      );
      if (score >= 0.22)
        candidates.set(row.id, {
          wine: {
            id: row.id,
            name,
            original,
            producer: field(row.producer),
            country: field(row.country),
          },
          score,
          exact,
        });
    }
    const ranked = [...candidates.values()].sort(
      (a, b) =>
        b.score - a.score || a.wine.name.localeCompare(b.wine.name, "ko"),
    );
    if (ranked.length) {
      const exact = ranked.filter((c) => c.exact);
      const complete = "total" in raw && raw.total === raw.items.length;
      return {
        candidates: ranked.slice(0, 8).map((c) => c.wine),
        exactId: complete && exact.length === 1 ? exact[0].wine.id : null,
      };
    }
  }
  return { candidates: [], exactId: null };
}
