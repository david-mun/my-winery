import type {
  ReceiptAnalysis,
  WineAnalysis,
} from "../../lib/analysis/contracts";
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
        { name: "가상 와인 A", vintage_label: "UNKNOWN", quantity: 1 },
        { name: "가상 와인 B", vintage_label: "UNKNOWN", quantity: 1 },
      ],
    },
    {
      kind: "wine",
      raw_label: "가상 와인 C 2025",
      printed_quantity: 2,
      unit_price: 10000,
      amount: 20000,
      wines: [{ name: "가상 와인 C", vintage_label: "2025", quantity: 2 }],
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
  },
  evidence: [
    { field: "name", text: "Example Blanc" },
    { field: "wine_type", text: "WHITE WINE" },
    { field: "vintage_label", text: "2025" },
  ],
  warnings: [],
};
