import { describe, expect, it } from "vitest";
import { validateAnalysis } from "../lib/analysis/validation";
import {
  receiptFixture,
  wineFixture,
  receiptDetailsFixture,
} from "./fixtures/analysis";
import { wineDisplayName } from "../lib/analysis/contracts";
import { receiptInput } from "../lib/domain";

describe("provider-independent photo analysis validation", () => {
  it("preserves bundle total, entire-receipt discounts and total bottle quantities", () => {
    const result = validateAnalysis("receipt", structuredClone(receiptFixture));
    expect(result.warnings).toEqual([]);
    if (result.task !== "receipt") throw Error();
    const r = result.analysis;
    expect(
      r.lines.reduce((sum, l) => sum + l.amount!, 0) - r.discount_amount!,
    ).toBe(r.paid_amount);
    expect(
      r.lines.flatMap((l) => l.wines).reduce((s, w) => s + w.quantity!, 0),
    ).toBe(4);
    expect(r.lines[0].amount).toBe(39900);
    // Model has no allocation or database-ID fields to override.
    expect(() =>
      validateAnalysis("receipt", {
        ...r,
        lines: [{ ...r.lines[0], allocated_amount: 19950 }],
      }),
    ).toThrow();
    const payload = {
      merchant_id: null,
      purchased_on: r.purchased_on,
      discount_amount: r.discount_amount,
      paid_amount: r.paid_amount,
      notes: null,
      lines: r.lines.map((l) => ({
        line_kind: l.kind,
        raw_label: l.raw_label,
        line_amount: l.amount,
        wines: l.wines.map((w) => ({
          wine_name: w.name,
          vintage_label: w.vintage_label,
          bottle_quantity: w.quantity,
        })),
      })),
    };
    expect(receiptInput.safeParse(payload).success).toBe(true);
  });
  it("keeps missing money unknown and flags mismatches without creating adjustment rows", () => {
    const r = structuredClone(receiptFixture);
    r.lines[0].amount = null;
    r.discount_amount = null;
    const value = validateAnalysis("receipt", r);
    expect(value.warnings.join()).toContain("빈 값은 0원");
    expect(value.analysis).toMatchObject({ discount_amount: null });
    const mismatch = structuredClone(receiptFixture);
    mismatch.paid_amount = 1;
    expect(validateAnalysis("receipt", mismatch).warnings.join()).toContain(
      "결제액이 다릅니다",
    );
  });
  it("does not expand POS vintage suffixes, fabricate dates or admit non-wine/foreign-currency rows", () => {
    const r = structuredClone(receiptFixture);
    r.lines[1].raw_label = "가상 와인 C22";
    r.lines[1].wines[0].vintage_label = "2022";
    r.purchased_on = "2026-02-30";
    const result = validateAnalysis("receipt", r);
    if (result.task !== "receipt") throw Error();
    expect(result.analysis.lines[1].wines[0].vintage_label).toBe("UNKNOWN");
    expect(result.analysis.purchased_on).toBeNull();
    expect(() =>
      validateAnalysis("receipt", { ...r, currency: "OTHER" }),
    ).toThrow();
    r.lines[1].kind = "other";
    expect(() => validateAnalysis("receipt", r)).toThrow();
  });
  it("rejects multiple bottles and extra private/rating/identity fields", () => {
    expect(() =>
      validateAnalysis("wine-label", { ...wineFixture, bottle_count: 6 }),
    ).toThrow(/한 병/);
    expect(() =>
      validateAnalysis("wine-label", {
        ...wineFixture,
        wine: { ...wineFixture.wine, vivino_score: 4.5 },
      }),
    ).toThrow();
    expect(() =>
      validateAnalysis("receipt", {
        ...receiptFixture,
        owner_id: "another-user",
      }),
    ).toThrow();
  });
  it("clears unsupported observed facts and preserves UNKNOWN separately from explicit NV", () => {
    const r = structuredClone(wineFixture);
    r.wine!.alcohol_percent = 13;
    r.wine!.vintage_label = "NV";
    r.evidence = r.evidence.filter((e) => e.field !== "vintage_label");
    const value = validateAnalysis("wine-label", r);
    if (value.task !== "wine-label") throw Error();
    expect(value.analysis.wine).toMatchObject({
      alcohol_percent: null,
      vintage_label: "UNKNOWN",
    });
    r.evidence.push({ field: "vintage_label", text: "NV" });
    expect(validateAnalysis("wine-label", r).analysis).toMatchObject({
      wine: { vintage_label: "NV" },
    });
  });
});

it("keeps product suggestions separate from printed names, vintage and bundle accounting", () => {
  const r = structuredClone(receiptFixture);
  r.lines[0].wines[0].details = structuredClone(receiptDetailsFixture);
  const result = validateAnalysis("receipt", r);
  if (result.task !== "receipt") throw Error();
  expect(result.analysis.lines[0]).toMatchObject({
    raw_label: receiptFixture.lines[0].raw_label,
    amount: 39900,
    wines: [
      {
        name: "가상 와인 A",
        vintage_label: "UNKNOWN",
        details: receiptDetailsFixture,
      },
      { details: null },
    ],
  });
  expect(result.analysis.discount_amount).toBe(18000);
  expect(result.warnings.some((w) => w.includes("AI 후보"))).toBe(true);
});

it("removes invented vintage years from suggested names and invalid alcohol ranges", () => {
  const r = structuredClone(receiptFixture);
  r.lines[0].wines[0].details = {
    ...receiptDetailsFixture,
    name_ko: "가상 와인 2022",
    name_en: "Example Blanc 2022",
    alcohol_percent: { min: 14, max: 12 },
  };
  const result = validateAnalysis("receipt", r);
  if (result.task !== "receipt") throw Error();
  expect(result.analysis.lines[0].wines[0]).toMatchObject({
    vintage_label: "UNKNOWN",
    details: {
      name_ko: "가상 와인",
      name_en: "Example Blanc",
      alcohol_percent: null,
    },
  });
});

it("accepts earlier drafts without details but rejects model-supplied IDs and invalid alcohol", () => {
  const r = structuredClone(receiptFixture);
  const old = JSON.parse(JSON.stringify(r));
  delete old.lines[0].wines[0].details;
  const compatible = validateAnalysis("receipt", old);
  if (compatible.task !== "receipt") throw Error();
  expect(compatible.analysis.lines[0].wines[0].details).toBeNull();
  r.lines[0].wines[0].details = {
    ...receiptDetailsFixture,
    wine_id: "attacker",
  } as typeof receiptDetailsFixture;
  expect(() => validateAnalysis("receipt", r)).toThrow();
  r.lines[0].wines[0].details = {
    ...receiptDetailsFixture,
    alcohol_percent: { min: -1, max: 101 },
  };
  expect(() => validateAnalysis("receipt", r)).toThrow();
});

it("combines a printed producer with a generic varietal without duplicating an existing prefix", () => {
  const facts = {
    ...wineFixture.wine!,
    name: "Sauvignon Blanc",
    producer: "Example Estate",
  };
  expect(wineDisplayName(facts)).toBe("Example Estate Sauvignon Blanc");
  expect(
    wineDisplayName({ ...facts, name: "Example Estate Sauvignon Blanc" }),
  ).toBe("Example Estate Sauvignon Blanc");
});
