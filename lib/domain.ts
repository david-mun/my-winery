import { z } from "zod";
export const wineTypes = {
  red: "레드",
  white: "화이트",
  sparkling: "스파클링",
  rose: "로제",
  dessert: "디저트",
  fortified: "주정강화",
  other: "기타",
} as const;
export type WineType = keyof typeof wineTypes;
const text = z.string().trim().max(200).nullable();
export const vintage = z
  .string()
  .trim()
  .regex(/^(NV|UNKNOWN|[12]\d{3})?$/, "빈티지를 확인해 주세요.")
  .nullish()
  .transform((value) => value || "UNKNOWN");
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v &&
      v <= today(),
    "유효한 날짜를 입력해 주세요.",
  );
export const wineInput = z.object({
  name_ko: z.string().trim().min(1).max(200),
  name_original: text,
  producer: text,
  wine_type: z.enum([
    "red",
    "white",
    "sparkling",
    "rose",
    "dessert",
    "fortified",
    "other",
  ]),
  grape: text,
  country: text,
  region: text,
  description: z.string().max(5000).nullable(),
});
export const noteInput = z
  .object({
    wine_id: z.uuid(),
    vintage_label: vintage,
    my_rating: z.number().min(1).max(5).multipleOf(0.1).nullable(),
    review_text: z.string().trim().max(5000).nullable(),
    tasted_on: date.nullable(),
  })
  .refine(
    (v) => v.my_rating !== null || !!v.review_text,
    "평점 또는 후기를 입력해 주세요.",
  );
export function validVivinoUrl(value: string) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      ["vivino.com", "www.vivino.com"].includes(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port
    );
  } catch {
    return false;
  }
}
export const ratingInput = z
  .object({
    wine_id: z.uuid(),
    source: z.literal("vivino").default("vivino"),
    score: z.number().min(0).max(5).multipleOf(0.1),
    rating_scope: z
      .enum(["ALL_VINTAGES", "VINTAGE", "NV", "UNKNOWN"])
      .default("ALL_VINTAGES"),
    vintage_label: vintage,
    checked_on: date,
    source_url: z
      .string()
      .refine(validVivinoUrl, "Vivino HTTPS 주소만 입력할 수 있습니다."),
    verification_status: z.enum(["verified", "needs_review", "unverified"]),
    notes: z.string().max(5000).nullable(),
  })
  .refine(
    (v) =>
      v.rating_scope === "VINTAGE"
        ? /^[12]\d{3}$/.test(v.vintage_label)
        : v.vintage_label === (v.rating_scope === "NV" ? "NV" : "UNKNOWN"),
    "평점 범위와 빈티지가 일치해야 합니다.",
  );
const money = z.number().int().min(0).max(1_000_000_000);
const bottle = z.object({
  wine_id: z.uuid().optional(),
  wine_name: z.string().trim().min(1).max(300).optional(),
  producer: z.string().trim().max(200).nullable().optional(),
  name_original: z.string().trim().max(200).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  wine_type: wineInput.shape.wine_type.optional(),
  country: z.string().trim().max(200).nullable().optional(),
  region: z.string().trim().max(200).nullable().optional(),
  grape: z.string().trim().max(200).nullable().optional(),
  vintage_label: vintage,
  bottle_quantity: z.number().int().min(1).max(10000),
});
const line = z
  .object({
    line_kind: z.enum(["wine", "bundle"]),
    raw_label: z.string().trim().min(1).max(300),
    line_amount: money,
    notes: z.string().max(5000).nullable().optional(),
    wines: z.array(bottle).min(1).max(100),
  })
  .superRefine((v, c) => {
    if (
      v.line_kind === "wine" &&
      (v.wines.length !== 1 || v.line_amount % v.wines[0].bottle_quantity !== 0)
    )
      c.addIssue({
        code: "custom",
        message: "일반 품목은 한 와인이며 병당 정수 가격이어야 합니다.",
      });
    if (v.line_kind === "bundle" && v.wines.length < 2)
      c.addIssue({
        code: "custom",
        message: "세트에는 두 개 이상의 구성 항목이 필요합니다.",
      });
  });
export const receiptInput = z
  .object({
    id: z.uuid().optional(),
    version: z.number().int().positive().optional(),
    merchant_id: z.uuid().nullable(),
    purchased_on: date,
    paid_amount: money,
    discount_amount: money,
    notes: z.string().max(5000).nullable(),
    lines: z.array(line).min(1).max(100),
  })
  .superRefine((v, c) => {
    if (
      v.lines.reduce((s, l) => s + l.line_amount, 0) - v.discount_amount !==
      v.paid_amount
    )
      c.addIssue({
        code: "custom",
        message: "항목 합계에서 할인을 뺀 값과 실결제액이 다릅니다.",
      });
    if (v.id && !v.version)
      c.addIssue({ code: "custom", message: "수정 버전이 필요합니다." });
  });
export type ReceiptInput = z.infer<typeof receiptInput>;
export type Wine = z.infer<typeof wineInput> & {
  id: string;
  owner_id?: string;
  identity_key?: string;
  created_at?: string;
};
export type Note = z.infer<typeof noteInput> & {
  id: string;
  created_at: string;
  updated_at?: string;
};
export type Rating = Omit<
  z.infer<typeof ratingInput>,
  "checked_on" | "score"
> & {
  id: string;
  checked_on: string | null;
  score: number | null;
  source_row?: number | null;
  created_at: string;
};
export type Receipt = {
  id: string;
  purchased_on: string;
  paid_amount: number;
  discount_amount: number;
  version: number;
  merchant_id: string | null;
  notes: string | null;
  source_key?: string;
};
export type Line = {
  id: string;
  receipt_id: string;
  line_kind: "wine" | "bundle" | "discount";
  raw_label: string;
  line_amount: number;
  notes?: string | null;
  line_no: number;
};
export type Link = {
  id: string;
  receipt_line_id: string;
  wine_id: string;
  vintage_label: string;
  bottle_quantity: number;
  allocated_amount: number | null;
};
export type Asset = {
  id: string;
  wine_id: string | null;
  receipt_id: string | null;
  created_at?: string;
  photo_credit?: {
    title: string;
    page: string;
    license: string;
    licenseUrl: string;
    author: string;
  } | null;
  object_path: string;
  mime_type: string;
};
export type Collection = {
  wines: Wine[];
  notes: Note[];
  ratings: Rating[];
  receipts: Receipt[];
  lines: Line[];
  links: Link[];
  merchants: { id: string; name: string }[];
  assets: Asset[];
};
export const emptyCollection = (): Collection => ({
  wines: [],
  notes: [],
  ratings: [],
  receipts: [],
  lines: [],
  links: [],
  merchants: [],
  assets: [],
});
export function wineSummary(wine: Wine, data: Collection) {
  const links = data.links.filter((l) => l.wine_id === wine.id);
  const lines = data.lines.filter((l) =>
    links.some((x) => x.receipt_line_id === l.id),
  );
  const receipts = data.receipts
    .filter((r) => lines.some((l) => l.receipt_id === r.id))
    .sort(
      (a, b) =>
        b.purchased_on.localeCompare(a.purchased_on) ||
        a.id.localeCompare(b.id),
    );
  const latestLines = lines.filter((l) => l.receipt_id === receipts[0]?.id);
  const latestLinks = links.filter((l) =>
    latestLines.some((x) => x.id === l.receipt_line_id),
  );
  const quantity = latestLinks.reduce((s, l) => s + l.bottle_quantity, 0);
  const price =
    latestLinks.length && latestLinks.every((l) => l.allocated_amount !== null)
      ? latestLinks.reduce((s, l) => s + l.allocated_amount!, 0) / quantity
      : null;
  const rating = data.ratings
    .filter((r) => r.wine_id === wine.id)
    .sort(
      (a, b) =>
        (b.checked_on ?? "").localeCompare(a.checked_on ?? "") ||
        Number(b.rating_scope === "ALL_VINTAGES") -
          Number(a.rating_scope === "ALL_VINTAGES") ||
        (a.source_row ?? Infinity) - (b.source_row ?? Infinity) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id),
    )[0];
  const notes = data.notes
    .filter((r) => r.wine_id === wine.id)
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    );
  return {
    wine,
    links,
    receipts,
    price,
    rating,
    myRating: notes[0]?.my_rating ?? null,
    tastingNote:
      notes.find((note) => note.review_text?.trim())?.review_text?.trim() ??
      null,
    bottles: links.reduce((s, l) => s + l.bottle_quantity, 0),
    latest: receipts[0]?.purchased_on ?? null,
  };
}
export type Filters = {
  q?: string;
  type?: string[];
  country?: string;
  region?: string;
  grape?: string;
  vivinoMin?: string;
  myMin?: string;
  sort?: string;
};
export function ratingMinimum(raw?: string) {
  const score = Number(raw);
  return score >= 1 && score <= 5 && Number.isInteger(score * 10)
    ? score
    : null;
}
export function grapeNames(raw?: string | null) {
  return [
    ...new Set(
      (raw ?? "")
        .normalize("NFKC")
        .split(/[,;/+·、]/)
        .map((value) => value.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ];
}
export function filteredWines(data: Collection, f: Filters) {
  const vivinoMin = ratingMinimum(f.vivinoMin);
  const myMin = ratingMinimum(f.myMin);
  const result = data.wines
    .map((w) => wineSummary(w, data))
    .filter((s) => {
      const w = s.wine,
        q = (f.q ?? "").trim().toLowerCase();
      return (
        [w.name_ko, w.name_original, w.producer, w.country, w.region, w.grape]
          .join(" ")
          .toLowerCase()
          .includes(q) &&
        (!f.type?.length || f.type.includes(w.wine_type)) &&
        (!f.country || w.country === f.country) &&
        (!f.region || w.region === f.region) &&
        (!f.grape ||
          grapeNames(w.grape).some(
            (grape) =>
              grape.toLowerCase() ===
              f
                .grape!.normalize("NFKC")
                .trim()
                .replace(/\s+/g, " ")
                .toLowerCase(),
          )) &&
        (vivinoMin === null ||
          (s.rating?.score != null &&
            s.rating.verification_status !== "needs_review" &&
            s.rating.score >= vivinoMin)) &&
        (myMin === null || (s.myRating !== null && s.myRating >= myMin))
      );
    });
  const compareNullable = (
    a: number | string | null,
    b: number | string | null,
    asc = false,
  ) =>
    a === null
      ? b === null
        ? 0
        : 1
      : b === null
        ? -1
        : (typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b))) * (asc ? 1 : -1);
  return result.sort((a, b) => {
    let cmp = 0;
    switch (f.sort) {
      case "name":
        cmp = a.wine.name_ko.localeCompare(b.wine.name_ko, "ko");
        break;
      case "vivino":
        cmp = compareNullable(
          a.rating?.verification_status === "needs_review"
            ? null
            : (a.rating?.score ?? null),
          b.rating?.verification_status === "needs_review"
            ? null
            : (b.rating?.score ?? null),
        );
        break;
      case "mine":
        cmp = compareNullable(a.myRating, b.myRating);
        break;
      case "priceAsc":
      case "priceDesc":
        cmp = compareNullable(a.price, b.price, f.sort === "priceAsc");
        break;
      default:
        cmp = compareNullable(a.latest, b.latest);
    }
    return (
      cmp ||
      a.wine.name_ko.localeCompare(b.wine.name_ko, "ko") ||
      a.wine.id.localeCompare(b.wine.id)
    );
  });
}
export const won = (n: number | null) =>
  n === null ? "가격 미확인" : `${n.toLocaleString("ko-KR")}원`;
export const vintageLabel = (v: string) =>
  v === "UNKNOWN" ? "빈티지 미확인" : v;
