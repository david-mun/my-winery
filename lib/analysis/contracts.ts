import { z } from "zod";

// Shared data contract only. No provider, credentials or server imports here.
export const analysisTask = z.enum(["receipt", "wine-label"]);
export type AnalysisTask = z.infer<typeof analysisTask>;
const text = z.string().trim().min(1).max(200).nullable();
const money = z.number().int().min(0).max(1_000_000_000).nullable();
const quantity = z.number().int().min(1).max(10000).nullable();
const vintage = z
  .string()
  .trim()
  .regex(/^(UNKNOWN|NV|[12][0-9]{3})?$/)
  .nullish()
  .transform((value) => value || "UNKNOWN");
export const factFields = [
  "name",
  "producer",
  "wine_type",
  "country",
  "region",
  "grapes",
  "vintage_label",
  "alcohol_percent",
  "bottle_volume_ml",
  "label_description",
] as const;
export const wineFacts = z
  .object({
    name: text,
    producer: text,
    wine_type: z
      .enum([
        "red",
        "white",
        "sparkling",
        "rose",
        "dessert",
        "fortified",
        "other",
      ])
      .nullable(),
    country: text,
    region: text,
    grapes: z.array(z.string().min(1).max(100)).max(20),
    vintage_label: vintage,
    alcohol_percent: z.number().min(0).max(100).nullable(),
    bottle_volume_ml: z.number().int().min(1).max(30000).nullable(),
    label_description: z.string().min(1).max(1000).nullable(),
    summary_ko: z.string().trim().min(1).max(1000).nullable().default(null),
  })
  .strict();
export type WineFacts = z.infer<typeof wineFacts>;
// Product-name identification is a model suggestion, separate from printed facts.
export const receiptWineDetails = z
  .object({
    name_ko: text,
    name_en: text,
    producer: text,
    country: text,
    region: text,
    grapes: z.array(z.string().min(1).max(100)).max(20),
    alcohol_percent: z
      .object({
        min: z.number().min(0).max(100),
        max: z.number().min(0).max(100),
      })
      .strict()
      .nullable(),
    confidence: z.enum(["high", "medium", "low"]),
    notes: z.string().min(1).max(500).nullable(),
    summary_ko: z.string().trim().min(1).max(1000).nullable().default(null),
  })
  .strict();
export type ReceiptWineDetails = z.infer<typeof receiptWineDetails>;
export const wineAnalysisSchema = z
  .object({
    bottle_count: z.number().int().min(0).max(100),
    wine: wineFacts.nullable(),
    evidence: z
      .array(
        z
          .object({
            field: z.enum(factFields),
            text: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(30),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();
export const receiptAnalysisSchema = z
  .object({
    merchant: text,
    purchased_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    currency: z.enum(["KRW", "UNKNOWN", "OTHER"]),
    paid_amount: money,
    discount_amount: money,
    lines: z
      .array(
        z
          .object({
            kind: z.enum(["wine", "bundle", "other", "unknown"]),
            raw_label: z.string().trim().min(1).max(300),
            printed_quantity: quantity,
            unit_price: money,
            amount: money,
            wines: z
              .array(
                z
                  .object({
                    name: text,
                    vintage_label: vintage,
                    quantity,
                    details: receiptWineDetails.nullable().default(null),
                  })
                  .strict(),
              )
              .max(100),
          })
          .strict(),
      )
      .max(100),
    warnings: z.array(z.string().max(500)).max(20),
  })
  .strict();
export type ReceiptAnalysis = z.infer<typeof receiptAnalysisSchema>;
export type WineAnalysis = z.infer<typeof wineAnalysisSchema>;
export type AnalysisResult =
  | { task: "receipt"; analysis: ReceiptAnalysis; warnings: string[] }
  | { task: "wine-label"; analysis: WineAnalysis; warnings: string[] };

export function wineDescription(wine: WineFacts) {
  return wine.summary_ko ?? "";
}

// Compose only strings actually extracted from the label; never enrich from memory.
export function wineDisplayName(wine: WineFacts) {
  const name = wine.name ?? "",
    producer = wine.producer ?? "";
  return producer &&
    !name.toLocaleLowerCase().includes(producer.toLocaleLowerCase())
    ? `${producer} ${name}`
    : name;
}
