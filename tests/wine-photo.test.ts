import { expect, it } from "vitest";
import { winePhotoHits } from "../lib/wine-photo-catalog";
import { parseReceiptText } from "../lib/receipt-ocr";
it("offers only supported, explicitly licensed Commons photographs with credible location and attribution", () => {
  const meta = {
    LicenseShortName: { value: "CC BY 4.0" },
    Artist: { value: "<b>Example</b>" },
    LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
  };
  const info = {
    mime: "image/jpeg",
    url: "https://upload.wikimedia.org/wikipedia/commons/1/12/Wine.jpg",
    extmetadata: meta,
  };
  const rows = [
    info,
    { ...info, url: "https://example.org/image.jpg" },
    { ...info, extmetadata: { ...meta, Artist: { value: "" } } },
    {
      ...info,
      extmetadata: {
        ...meta,
        LicenseShortName: { value: "All rights reserved" },
      },
    },
  ];
  const hits = winePhotoHits({
    query: {
      pages: rows.map((im, i) => ({
        pageid: i + 1,
        title: "File:Bottle.jpg",
        imageinfo: [im],
      })),
    },
  });
  expect(hits.map((h) => [h.id, h.author])).toEqual([[1, "Example"]]);
});
it("reads aligned printed item columns without inventing a unit price", () => {
  const d = parseReceiptText(
    "예시마트\n품명 단가 수량 금액\n001 와인 A 12,000 2 24,000\n002 할인 1,000 -1 -1,000\n합계액: 23,000",
  );
  expect(d.items).toEqual([{ label: "와인 A", amount: 24000, quantity: 2 }]);
  expect(d.discount).toBe(1000);
  expect(d.paid).toBe(23000);
});
