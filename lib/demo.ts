import { emptyCollection, type Collection, type WineType } from "./domain";
export function demoCollection(): Collection {
  const data = emptyCollection();
  const samples = [
    ["루나 힐 소비뇽 블랑", "white", "뉴질랜드", "말보로", 4.2],
    ["카사 로사 리제르바", "red", "이탈리아", "토스카나", 4.1],
    ["메종 에투알 브뤼", "sparkling", "프랑스", "루아르", 3.9],
    ["솔레아 샤르도네", "white", "칠레", "카사블랑카", 4.0],
  ] as const;
  data.wines = samples.map((s, i) => ({
    id: `10000000-0000-4000-a000-00000000000${i}`,
    name_ko: s[0],
    name_original: null,
    producer: null,
    wine_type: s[1] as WineType,
    grape: null,
    country: s[2],
    region: s[3],
    description: "화면을 살펴보기 위한 가상의 와인입니다.",
  }));
  data.ratings = data.wines.map((w, i) => ({
    id: `rating${i}`,
    wine_id: w.id,
    source: "vivino",
    score: samples[i][4],
    rating_scope: "ALL_VINTAGES",
    vintage_label: "UNKNOWN",
    checked_on: "2026-10-01",
    source_url: "https://www.vivino.com/",
    verification_status: "unverified",
    notes: "가상 예시 점수",
    created_at: "2026-10-01",
  }));
  data.notes = [
    {
      id: "note0",
      wine_id: data.wines[0].id,
      vintage_label: "UNKNOWN",
      my_rating: 4,
      review_text: "산뜻한 향과 여운. 가상의 시음 노트입니다.",
      tasted_on: null,
      created_at: "2026-10-01",
    },
  ];
  data.receipts = [
    {
      id: "demo-receipt",
      purchased_on: "2026-10-01",
      paid_amount: 75000,
      discount_amount: 5000,
      version: 1,
      merchant_id: null,
      notes: "가상 구매 예시",
    },
  ];
  data.lines = data.wines.slice(0, 2).map((w, i) => ({
    id: `line${i}`,
    receipt_id: "demo-receipt",
    line_kind: "wine",
    line_no: i + 1,
    raw_label: w.name_ko,
    line_amount: 40000,
  }));
  data.links = data.lines.map((l, i) => ({
    id: `link${i}`,
    receipt_line_id: l.id,
    wine_id: data.wines[i].id,
    vintage_label: "2024",
    bottle_quantity: 1,
    allocated_amount: 40000,
  }));
  return data;
}
