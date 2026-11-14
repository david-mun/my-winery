import { describe, expect, it } from "vitest";
import { parseReceiptText } from "../lib/receipt-ocr";

// A fictional POS layout modelling detached prices, a misread row number,
// a wrapped vintage and scrambled coupon columns. No payment identifiers.
const source = [
  "예시마트",
  "품명",
  "단가",
  "수량",
  "금액",
  "001 와인 A25",
  "9000000000001",
  "002 와인 B25",
  "9000000000002",
  "003 와인 C25",
  "9000000000003",
  "21,900",
  "1",
  "21,900",
  "004 와인 D23 750ml",
  "9000000000004",
  "31,900",
  "1",
  "31,900",
  "00E 와인 E",
  "25",
  "9000000000005",
  "30,900",
  "1",
  "30,900",
  "006 와인 F23",
  "261003",
  "34,900",
  "1",
  "34,900",
  "007 쿠폰 A",
  "2022",
  "002 쿠폰 B",
  "2222",
  "009 쿠폰 C",
  "2222",
  "24,900",
  "23,900",
  "1",
  "23,900",
  "3,000",
  "-1",
  "-3,000",
  "5,000",
  "-1",
  "-5,000",
  "5,000",
  "-2",
  "-10,000",
  "1",
  "24,900",
  "0",
  "6",
  "총수량:",
  "면세합:",
  "과세합:",
  "부가세:",
  "136,727",
  "13,673",
  "합계액:",
  "카 드:",
  "150,400",
  "150,400",
  "[전표번호] 2026-10-1060200",
  "[카드번호]",
  "99999999",
  "[승인번호]",
  "00000001 [승인일자]2026101021",
  "[승인금액]",
  "150,400 [할부개월]",
].join("\n");
describe("POS receipt OCR text", () => {
  it("reconciles six item rows and three coupon totals without guessing orphan prices", () => {
    const d = parseReceiptText(source);
    expect(d).toMatchObject({
      merchant: "예시마트",
      date: "2026-10-10",
      paid: 150400,
      discount: 18000,
    });
    expect(d.items.map((i) => i.amount)).toEqual([
      null,
      null,
      21900,
      31900,
      30900,
      34900,
    ]);
    expect(d.items.map((i) => i.quantity)).toEqual([null, null, 1, 1, 1, 1]);
    expect(d.items[4].label).toBe("와인 E 25");
    expect(d.loosePrices.sort()).toEqual([23900, 24900]);
    expect(JSON.stringify(d)).not.toContain("99999999");
  });
  it("keeps conflicting paid totals and dates, missing coupon entries and inconsistent rows unresolved", () => {
    const d = parseReceiptText(
      source
        .replace("150,400 [할부개월]", "99,000 [할부개월]")
        .replace("2026101021", "2026111021")
        .replace("-10,000", "-1,000")
        .replace("31,900\n1\n31,900", "31,900\n2\n31,900"),
    );
    expect([d.date, d.paid, d.discount, d.items[3].amount]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
  it("rejects unsupported text without treating the approval section as merchandise", () => {
    expect(() => parseReceiptText("글자만 있는 사진")).toThrow();
    expect(() => parseReceiptText("품명\n합계액:\n001 비상품")).toThrow();
  });
});
