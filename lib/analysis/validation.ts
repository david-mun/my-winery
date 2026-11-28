import {
  receiptAnalysisSchema,
  wineAnalysisSchema,
  winePhotoAnalysisSchema,
  type AnalysisTask,
  type AnalysisResult,
} from "./contracts";

// Independent of Gemini: the provider can be replaced without changing forms.
export class AnalysisError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function validateAnalysis(
  task: AnalysisTask,
  value: unknown,
  photoCount = 1,
): AnalysisResult {
  if (task === "wine-photo") {
    const parsed = winePhotoAnalysisSchema.safeParse(value);
    if (!parsed.success)
      throw new AnalysisError(
        502,
        "와인 사진 분석 형식이 올바르지 않습니다. 다시 분석해 주세요.",
      );
    const data = parsed.data;
    if (
      !data.bottle_count ||
      data.bottle_count !== data.bottles.length ||
      data.bottles.some(
        (b, i) =>
          b.position_left_to_right !== i + 1 ||
          (photoCount > 1 && b.source_photo === undefined) ||
          (b.source_photo ?? 1) > photoCount ||
          (b.source_photo ?? 1) < (data.bottles[i - 1]?.source_photo ?? 1),
      )
    )
      throw new AnalysisError(
        422,
        "와인 병을 구분하지 못했습니다. 라벨이 보이도록 다시 찍어 주세요.",
      );
    const warnings = [...data.warnings];
    if (
      photoCount > 1 &&
      new Set(data.bottles.map((bottle) => bottle.source_photo)).size <
        photoCount
    )
      warnings.push(
        "일부 사진에서 와인을 찾지 못했습니다. 사진을 확인해 주세요.",
      );
    for (const bottle of data.bottles) {
      const result = validateAnalysis("wine-label", bottle.observed);
      if (result.task !== "wine-label")
        throw new AnalysisError(502, "분석 결과를 확인해 주세요.");
      bottle.observed = result.analysis;
      warnings.push(...result.warnings);
      // This task never supplies vintage or purchase facts, even with model evidence.
      bottle.observed.wine!.vintage_label = "UNKNOWN";
      const candidate = bottle.product_candidate;
      if (candidate) {
        for (const field of ["name_ko", "name_en", "summary_ko"] as const)
          if (candidate[field])
            candidate[field] =
              candidate[field]!.replace(/[12][0-9]{3}/g, "")
                .replace(/\s+/g, " ")
                .trim() || null;
        if (!candidate.name_ko && !candidate.name_en)
          bottle.product_candidate = null;
        if (
          candidate.alcohol_percent &&
          candidate.alcohol_percent.min > candidate.alcohol_percent.max
        )
          candidate.alcohol_percent = null;
      }
    }
    warnings.push(
      "와인 후보는 AI 추정입니다. 라벨과 대조하고 구매일·구매처·가격을 직접 입력해 주세요.",
    );
    return { task, analysis: data, warnings: [...new Set(warnings)] };
  }
  if (task === "wine-label") {
    const parsed = wineAnalysisSchema.safeParse(value);
    if (!parsed.success)
      throw new AnalysisError(
        502,
        "와인 분석 형식이 올바르지 않습니다. 다시 분석하거나 직접 입력해 주세요.",
      );
    const data = parsed.data;
    if (data.bottle_count !== 1 || !data.wine)
      throw new AnalysisError(
        422,
        "한 병의 라벨만 보이도록 영역을 잘라 다시 분석해 주세요.",
      );
    const wine = data.wine;
    const warnings = [...data.warnings];
    // Keep evidence keyed by field, rather than trusting model-generated paths.
    for (const field of Object.keys(wine) as (keyof typeof wine)[]) {
      if (field === "summary_ko") continue;
      const v = wine[field];
      if (v === null || v === "UNKNOWN" || (Array.isArray(v) && v.length === 0))
        continue;
      const evidence = data.evidence.find((e) => e.field === field)?.text;
      if (
        !evidence ||
        (field === "vintage_label" && !evidence.includes(String(v)))
      ) {
        warnings.push(`사진에서 확인되지 않은 상세 정보를 비워 두었습니다.`);
        if (field === "grapes") wine.grapes = [];
        else if (field === "vintage_label") wine.vintage_label = "UNKNOWN";
        else Object.assign(wine, { [field]: null });
      }
    }
    if (!wine.name)
      throw new AnalysisError(
        422,
        "와인 이름을 읽지 못했습니다. 라벨을 더 가까이 찍거나 직접 입력해 주세요.",
      );
    warnings.push(
      "라벨 원문과 상품 동일성을 확인해 주세요. 사진의 브랜드가 실제 생산자와 다를 수 있습니다.",
    );
    return { task, analysis: data, warnings };
  }
  const parsed = receiptAnalysisSchema.safeParse(value);
  if (!parsed.success)
    throw new AnalysisError(
      502,
      "영수증 분석 형식이 올바르지 않습니다. 다시 분석하거나 직접 입력해 주세요.",
    );
  const data = parsed.data;
  const warnings = [...data.warnings];
  if (
    data.currency !== "KRW" ||
    !data.lines.length ||
    data.lines.some((l) => !["wine", "bundle"].includes(l.kind))
  )
    throw new AnalysisError(
      422,
      "원화 와인 구매 영수증만 지원합니다. 알 수 없는 품목은 직접 입력해 주세요.",
    );
  if (
    data.lines.some(
      (l) =>
        (l.kind === "wine" && l.wines.length !== 1) ||
        (l.kind === "bundle" && l.wines.length < 2),
    )
  )
    throw new AnalysisError(
      422,
      "세트 구성이나 와인 연결을 읽지 못했습니다. 직접 입력하거나 다시 분석해 주세요.",
    );
  if (data.purchased_on) {
    const t = new Date(data.purchased_on);
    if (
      !Number.isFinite(t.getTime()) ||
      t.toISOString().slice(0, 10) !== data.purchased_on ||
      t.getTime() > Date.now()
    ) {
      data.purchased_on = null;
      warnings.push("구매일을 확인해 입력해 주세요.");
    }
  } else warnings.push("구매일을 확인해 입력해 주세요.");
  for (const line of data.lines) {
    if (
      line.amount !== null &&
      line.unit_price !== null &&
      line.printed_quantity !== null &&
      line.unit_price * line.printed_quantity !== line.amount
    )
      warnings.push(
        `${line.raw_label}: 인쇄된 단가·수량·금액이 일치하지 않습니다.`,
      );
    for (const bottle of line.wines) {
      const details = bottle.details;
      if (details) {
        // Unprinted years from product knowledge must not become bottle facts.
        for (const field of ["name_ko", "name_en"] as const) {
          const name = details[field];
          if (name) {
            details[field] =
              name
                .replace(/[12][0-9]{3}/g, (year) =>
                  line.raw_label.includes(year) ? year : "",
                )
                .replace(/\s+/g, " ")
                .trim() || null;
            if (details[field] !== name)
              warnings.push(
                `${line.raw_label}: 후보 이름에서 미확인 연도를 제외했습니다.`,
              );
          }
        }
        if (!bottle.name || (!details.name_ko && !details.name_en)) {
          bottle.details = null;
        } else {
          if (
            details.alcohol_percent &&
            details.alcohol_percent.min > details.alcohol_percent.max
          ) {
            details.alcohol_percent = null;
            warnings.push(`${line.raw_label}: 도수 범위를 확인해 주세요.`);
          }
        }
      }
      // Two-digit POS suffixes must never become a fabricated vintage.
      if (
        bottle.vintage_label !== "UNKNOWN" &&
        !line.raw_label.includes(bottle.vintage_label)
      ) {
        bottle.vintage_label = "UNKNOWN";
      }
    }
  }
  if (data.lines.some((line) => line.wines.some((wine) => wine.details)))
    warnings.push(
      "와인 상세는 상품명으로 추정한 AI 후보입니다. 실제 상품·원산지·품종·도수는 라벨과 대조해 주세요.",
    );
  if (
    data.lines.some(
      (l) => l.amount === null || l.wines.some((w) => w.quantity === null),
    ) ||
    data.paid_amount === null ||
    data.discount_amount === null
  )
    warnings.push(
      "미확인 금액·수량을 확인해 입력해 주세요. 빈 값은 0원이 아닙니다.",
    );
  else if (
    data.lines.reduce((s, l) => s + (l.amount ?? 0), 0) -
      data.discount_amount !==
    data.paid_amount
  )
    warnings.push(
      "품목 합계에서 할인을 뺀 값과 결제액이 다릅니다. 금액을 확인해 주세요.",
    );
  return { task, analysis: data, warnings };
}
