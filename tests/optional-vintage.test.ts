import { expect, it } from "vitest";
import { vintage, receiptInput, noteInput, ratingInput } from "../lib/domain";
import { validateAnalysis } from "../lib/analysis/validation";
import { wineDescription } from "../lib/analysis/contracts";
import { receiptFixture, wineFixture } from "./fixtures/analysis";
import {
  visibleDescription,
  preserveDescriptionMetadata,
} from "../lib/wine-description";

const wineId = "10000000-0000-4000-a000-000000000001";
it("accepts omitted/empty vintages while preserving NV and known years", () => {
  for (const v of [undefined, null, "", "  "])
    expect(vintage.parse(v)).toBe("UNKNOWN");
  for (const v of ["NV", "2022", "UNKNOWN"]) expect(vintage.parse(v)).toBe(v);
  expect(() => vintage.parse("22")).toThrow();
  const receipt = receiptInput.parse({
    purchased_on: "2026-10-10",
    merchant_id: null,
    discount_amount: 0,
    paid_amount: 10000,
    notes: null,
    lines: [
      {
        line_kind: "wine",
        raw_label: "테스트",
        line_amount: 10000,
        wines: [
          {
            wine_id: wineId,
            bottle_quantity: 1,
            description: "와인 설명",
            name_original: "Example Blanc",
          },
        ],
      },
    ],
  });
  expect(receipt.lines[0].wines[0]).toMatchObject({
    vintage_label: "UNKNOWN",
    description: "와인 설명",
    name_original: "Example Blanc",
  });
  expect(
    noteInput.parse({
      wine_id: wineId,
      my_rating: 4,
      review_text: null,
      tasted_on: null,
    }).vintage_label,
  ).toBe("UNKNOWN");
  expect(
    ratingInput.parse({
      wine_id: wineId,
      score: 4,
      checked_on: "2026-10-10",
      source_url: "https://www.vivino.com/w/1",
      verification_status: "unverified",
      notes: null,
    }),
  ).toMatchObject({ rating_scope: "ALL_VINTAGES", vintage_label: "UNKNOWN" });
});
it("accepts Gemini results with omitted/null vintages and keeps summaries separate from personal notes", () => {
  const receipt = JSON.parse(JSON.stringify(receiptFixture));
  for (const line of receipt.lines)
    for (const wine of line.wines) delete wine.vintage_label;
  const r = validateAnalysis("receipt", receipt);
  if (r.task !== "receipt") throw Error();
  expect(
    r.analysis.lines
      .flatMap((l) => l.wines)
      .every((w) => w.vintage_label === "UNKNOWN"),
  ).toBe(true);
  const label = JSON.parse(JSON.stringify(wineFixture));
  label.wine.vintage_label = null;
  const w = validateAnalysis("wine-label", label);
  if (w.task !== "wine-label" || !w.analysis.wine) throw Error();
  expect(w.analysis.wine.vintage_label).toBe("UNKNOWN");
  expect(wineDescription(w.analysis.wine)).toBe(wineFixture.wine!.summary_ko);
  expect(
    wineDescription({ ...w.analysis.wine, vintage_label: "2025" }),
  ).not.toContain("빈티지");
});
it("hides only generated vintage metadata and preserves it on an existing wine edit", () => {
  const existing = "사용자가 쓴 설명 2022\n사진 빈티지: 2022";
  expect(visibleDescription(existing)).toBe("사용자가 쓴 설명 2022");
  expect(preserveDescriptionMetadata("수정한 설명", existing)).toBe(
    "수정한 설명\n사진 빈티지: 2022",
  );
});
