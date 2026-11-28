import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { loadCollectionWines } from "../lib/analysis/collection-context";
import {
  collectionPrompt,
  resolveCollectionMatches,
  type CollectionWine,
} from "../lib/analysis/collection-matching";
import { validateAnalysis } from "../lib/analysis/validation";
import { receiptFixture, winePhotoFixture } from "./fixtures/analysis";

export const collectionWine: CollectionWine = {
  id: "33333333-3333-4333-8333-333333333333",
  name_ko: "테스트 에스테이트 소비뇽 블랑",
  name_original: "Test Estate Sauvignon Blanc",
  producer: "Test Estate",
  wine_type: "white",
  country: "뉴질랜드",
  region: "말보로",
  grape: "소비뇽 블랑",
};

it("loads every page under owner RLS and an explicit owner filter without sending private content", async () => {
  const row = { ...collectionWine, owner_id: "owner-a", description: "secret" };
  const range = vi
    .fn()
    .mockResolvedValueOnce({
      data: Array.from({ length: 500 }, () => row),
      error: null,
    })
    .mockResolvedValueOnce({ data: [row], error: null });
  const q = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range,
  };
  const db = { from: vi.fn(() => q) };
  const wines = await loadCollectionWines(
    db as unknown as Parameters<typeof loadCollectionWines>[0],
    "owner-a",
  );
  expect(wines).toHaveLength(501);
  expect(q.eq.mock.calls).toEqual([
    ["owner_id", "owner-a"],
    ["owner_id", "owner-a"],
  ]);
  expect(range.mock.calls).toEqual([
    [0, 499],
    [500, 999],
  ]);
  const prompt = collectionPrompt(wines);
  expect(prompt).toContain('"ref":501');
  expect(prompt).not.toContain(collectionWine.id);
  expect(prompt).not.toContain("owner-a");
  expect(prompt).not.toContain("secret");
});

it("resolves bundle components independently and ignores forged refs, nonexistent items and duplicates", () => {
  const result = validateAnalysis("receipt", structuredClone(receiptFixture));
  const proposed = {
    line_index: 0,
    wine_index: 1,
    collection_ref: 1,
    confidence: "medium",
    reason: "한글 약칭과 영문명이 같은 제품을 가리킵니다.",
  };
  const matches = resolveCollectionMatches(
    [
      proposed,
      proposed,
      { ...proposed, wine_index: 0, collection_ref: 2 },
      { ...proposed, line_index: 10 },
      { ...proposed, collection_ref: -1 },
      { ...proposed, wine_id: "another-owner-id" },
    ],
    result,
    [collectionWine],
  );
  expect(matches).toEqual([
    {
      line_index: 0,
      wine_index: 1,
      wine_id: collectionWine.id,
      confidence: "medium",
      reason: proposed.reason,
    },
  ]);
  expect(result.analysis).toEqual(receiptFixture);
});

it("validates photo positions and treats empty collections or missing suggestions as no match", () => {
  const result = validateAnalysis(
    "wine-photo",
    structuredClone(winePhotoFixture),
  );
  const match = {
    line_index: 1,
    wine_index: 0,
    collection_ref: 1,
    confidence: "low",
    reason: "상품명은 가깝지만 라벨 대조가 필요합니다.",
  };
  expect(
    resolveCollectionMatches(
      [match, { ...match, wine_index: 1 }, { ...match, line_index: 2 }],
      result,
      [collectionWine],
    ),
  ).toHaveLength(1);
  expect(resolveCollectionMatches([match], result, [])).toEqual([]);
  expect(resolveCollectionMatches(undefined, result, [collectionWine])).toEqual(
    [],
  );
});
