import { readBody } from "../lib/request-body";
import { describe, it, expect } from "vitest";
import {
  receiptInput,
  noteInput,
  ratingInput,
  validVivinoUrl,
  filteredWines,
  wineSummary,
  emptyCollection,
  grapeNames,
} from "../lib/domain";
import { safeNext, sameOrigin } from "../lib/security";
import { snapshot } from "../scripts/snapshot";
import { demoCollection } from "../lib/demo";
import { sanitizeImage } from "../lib/image";
import sharp from "sharp";
describe("domain and migration", () => {
  it("preserves snapshot counts, unknown vintage and empty tasting date", () => {
    const s = snapshot("tests/fixtures/data");
    expect(s.report).toEqual({
      wines: 10,
      bottles: 12,
      receipts: 2,
      paid: 293900,
      ratings: 11,
      notes: 5,
      media: 0,
    });
    expect(s.notes.every((n) => n.tasted_on === null)).toBe(true);
    expect(
      s.receipts[0].lines
        .find((l) => l.line_kind === "bundle")
        ?.wines.every((w) => w.vintage_label === "UNKNOWN"),
    ).toBe(true);
  });
  it("detects a discount deducted twice and rejects missing bundle members", () => {
    const s = snapshot("tests/fixtures/data");
    const p = structuredClone(s.receipts[1]);
    p.paid_amount -= 18000;
    expect(receiptInput.safeParse(p).success).toBe(false);
    const b = structuredClone(s.receipts[0]);
    b.lines.find((l) => l.line_kind === "bundle")!.wines.pop();
    expect(receiptInput.safeParse(b).success).toBe(false);
  });
  it("validates note score, date, empty content and rating scope", () => {
    const id = demoCollection().wines[0].id;
    expect(
      noteInput.safeParse({
        wine_id: id,
        vintage_label: "NV",
        my_rating: 3.75,
        review_text: null,
        tasted_on: null,
      }).success,
    ).toBe(false);
    expect(
      noteInput.safeParse({
        wine_id: id,
        vintage_label: "UNKNOWN",
        my_rating: null,
        review_text: "",
        tasted_on: null,
      }).success,
    ).toBe(false);
    expect(
      ratingInput.safeParse({
        wine_id: id,
        score: 4,
        rating_scope: "VINTAGE",
        vintage_label: "UNKNOWN",
        checked_on: "2026-10-11",
        source_url: "https://www.vivino.com/w/1",
        verification_status: "unverified",
        notes: null,
      }).success,
    ).toBe(false);
  });
  it("does not trust lookalike links or external return URLs", () => {
    for (const url of [
      "javascript:alert(1)",
      "https://vivino.com.evil.test/x",
      "https://user@www.vivino.com/x",
      "http://www.vivino.com",
    ])
      expect(validVivinoUrl(url)).toBe(false);
    expect(safeNext("//evil.test")).toBe("/wines");
    expect(safeNext("/\\evil.test")).toBe("/wines");
    expect(sameOrigin("https://evil.test", "http://localhost:3000")).toBe(
      false,
    );
  });
  it("filters AND conditions, counts distinct receipts, puts unknown price last", () => {
    const d = demoCollection();
    expect(filteredWines(d, { type: ["white"], myMin: "4" })).toHaveLength(1);
    expect(wineSummary(d.wines[0], d).receipts).toHaveLength(1);
    expect(filteredWines(d, { sort: "priceAsc" }).at(-1)?.price).toBeNull();
    d.ratings[0].verification_status = "needs_review";
    expect(
      filteredWines(d, { vivinoMin: "4" }).some(
        (x) => x.wine.id === d.wines[0].id,
      ),
    ).toBe(false);
  });
  it("filters exact varietals within blends and combines grape with existing conditions", () => {
    const data = demoCollection();
    expect(grapeNames(" 샤르도네, 피노 누아 / 샤르도네 ")).toEqual([
      "샤르도네",
      "피노 누아",
    ]);
    expect(filteredWines(data, { grape: "샤르도네" })).toHaveLength(2);
    expect(
      filteredWines(data, {
        grape: "샤르도네",
        country: "칠레",
        vivinoMin: "4",
      }),
    ).toHaveLength(1);
    expect(
      filteredWines(data, { grape: "샤르도네", type: ["red"] }),
    ).toHaveLength(0);
    expect(filteredWines(data, { grape: "" })).toHaveLength(4);
    expect(filteredWines(data, { grape: "르도" })).toHaveLength(0);
  });
  it("does not substitute an old known price for the latest unallocated purchase", () => {
    const d = demoCollection();
    d.receipts.push({
      ...d.receipts[0],
      id: "new",
      purchased_on: "2026-10-15",
    });
    d.lines.push({
      ...d.lines[0],
      id: "new-line",
      receipt_id: "new",
      line_kind: "bundle",
    });
    d.links.push({
      ...d.links[0],
      id: "new-link",
      receipt_line_id: "new-line",
      allocated_amount: null,
    });
    expect(wineSummary(d.wines[0], d).price).toBeNull();
    expect(wineSummary(d.wines[0], d).bottles).toBe(2);
  });
  it("unknown collection is empty, never populated with private snapshot", () => {
    expect(emptyCollection().wines).toEqual([]);
  });
  it("decodes images, strips metadata and rejects forged MIME", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 16, channels: 3, background: "red" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const output = await sanitizeImage(bytes, "image/jpeg");
    const m = await sharp(output).metadata();
    expect(m.format).toBe("webp");
    expect(m.exif).toBeUndefined();
    await expect(sanitizeImage(bytes, "image/png")).rejects.toThrow();
    await expect(
      sanitizeImage(Buffer.from("<script>bad</script>"), "image/jpeg"),
    ).rejects.toThrow();
  });
  it("caps chunked request bodies even when Content-Length is absent", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: "abcdefgh",
    });
    await expect(readBody(req, 4)).rejects.toThrow("BODY_TOO_LARGE");
  });
});
