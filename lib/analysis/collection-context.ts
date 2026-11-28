import "server-only";
import type { supabase } from "@/lib/supabase/server";
import type { CollectionWine } from "./collection-matching";
import { AnalysisError } from "./validation";

export async function loadCollectionWines(
  db: Awaited<ReturnType<typeof supabase>>,
  ownerId: string,
): Promise<CollectionWine[]> {
  const wines: CollectionWine[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await db
      .from("wines")
      .select(
        "id,owner_id,name_ko,name_original,producer,wine_type,country,region,grape",
      )
      .eq("owner_id", ownerId)
      .order("id")
      .range(start, start + pageSize - 1);
    if (error || !data || data.some((wine) => wine.owner_id !== ownerId))
      throw new AnalysisError(
        503,
        "내 와인 목록을 불러오지 못했습니다. 잠시 후 다시 분석해 주세요.",
      );
    for (const wine of data) {
      // Explicit allowlist: no notes, ratings, purchases, owner or storage paths.
      wines.push({
        id: wine.id,
        name_ko: wine.name_ko,
        name_original: wine.name_original,
        producer: wine.producer,
        wine_type: wine.wine_type,
        country: wine.country,
        region: wine.region,
        grape: wine.grape,
      });
    }
    if (data.length < pageSize) return wines;
  }
}
