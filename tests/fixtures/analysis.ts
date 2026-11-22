import type {
  ReceiptAnalysis,
  WineAnalysis,
  ReceiptWineDetails,
  WinePhotoAnalysis,
} from "../../lib/analysis/contracts";
export const receiptDetailsFixture: ReceiptWineDetails = {
  name_ko: "가상 상세 와인 C",
  name_en: "Example Estate Sauvignon Blanc",
  producer: "Example Estate",
  country: "뉴질랜드",
  region: "말보로",
  grapes: ["소비뇽 블랑"],
  alcohol_percent: { min: 12, max: 13 },
  confidence: "medium",
  notes: "상품명으로 추정한 가상 테스트 후보입니다.",
  summary_ko: "소비뇽 블랑으로 만든 가상의 화이트 와인 설명입니다.",
};
export const receiptFixture: ReceiptAnalysis = {
  merchant: "가상 와인숍",
  purchased_on: "2026-10-10",
  currency: "KRW",
  paid_amount: 41900,
  discount_amount: 18000,
  lines: [
    {
      kind: "bundle",
      raw_label: "가상 와인 A + 가상 와인 B",
      printed_quantity: 1,
      unit_price: 39900,
      amount: 39900,
      wines: [
        {
          name: "가상 와인 A",
          vintage_label: "UNKNOWN",
          quantity: 1,
          details: null,
        },
        {
          name: "가상 와인 B",
          vintage_label: "UNKNOWN",
          quantity: 1,
          details: null,
        },
      ],
    },
    {
      kind: "wine",
      raw_label: "가상 와인 C 2025",
      printed_quantity: 2,
      unit_price: 10000,
      amount: 20000,
      wines: [
        {
          name: "가상 와인 C",
          vintage_label: "2025",
          quantity: 2,
          details: null,
        },
      ],
    },
  ],
  warnings: [],
};
export const wineFixture: WineAnalysis = {
  bottle_count: 1,
  wine: {
    name: "Example Blanc",
    producer: null,
    wine_type: "white",
    country: null,
    region: null,
    grapes: [],
    vintage_label: "2025",
    alcohol_percent: null,
    bottle_volume_ml: null,
    label_description: null,
    summary_ko: "라벨에서 확인한 테스트 화이트 와인 설명입니다.",
  },
  evidence: [
    { field: "name", text: "Example Blanc" },
    { field: "wine_type", text: "WHITE WINE" },
    { field: "vintage_label", text: "2025" },
  ],
  warnings: [],
};
export const winePhotoFixture: WinePhotoAnalysis = {
  bottle_count: 2,
  bottles: [1, 2].map((position) => ({
    position_left_to_right: position,
    observed: structuredClone(wineFixture),
    product_candidate: structuredClone(receiptDetailsFixture),
  })),
  warnings: [],
};
