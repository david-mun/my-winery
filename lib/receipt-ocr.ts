// Converts pasted OCR lines into a local draft. Never persist the source text.
export type OcrItem = {
  label: string;
  amount: number | null;
  quantity: number | null;
};
export type OcrDraft = {
  merchant: string | null;
  date: string | null;
  paid: number | null;
  discount: number | null;
  items: OcrItem[];
  loosePrices: number[];
};
const number = (s = "") =>
  /^-?(?:\d{1,3}(?:,\d{3})+|\d+)$/.test(s) &&
  Math.abs(Number(s.replaceAll(",", ""))) <= 1_000_000_000
    ? Number(s.replaceAll(",", ""))
    : null;

function receiptDate(text: string) {
  const dates = new Set<string>();
  for (const m of text.matchAll(
    /(?:전표번호|승인일자|구매일|결제일)[\]\s:：]*(20\d{2})[-./]?(\d{2})[-./]?(\d{2})/g,
  )) {
    const date = m.slice(1, 4).join("-");
    const t = new Date(date + "T00:00:00Z");
    if (!Number.isNaN(t.valueOf()) && t.toISOString().startsWith(date))
      dates.add(date);
  }
  return dates.size === 1 ? [...dates][0] : null;
}

export function parseReceiptText(input: string): OcrDraft {
  if (input.length > 30000)
    throw new Error("OCR 텍스트는 30,000자 이하로 입력해 주세요.");
  const lines = input
    .normalize("NFKC")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const heading = lines.findIndex((s) =>
    /^품\s*명(?:\s+(?:단가|수량|금액)(?:\s+(?:단가|수량|금액))*)?$/.test(s),
  );
  const end = lines.findIndex((s) =>
    /^(?:총수량|면세합|과세합|부가세|합계액|카\s*드\s*:|\[전표번호\]|<<카드|\[카드번호\])/.test(
      s,
    ),
  );
  if (heading < 0 || end < heading)
    throw new Error(
      "품명과 합계가 포함된 영수증 전체 텍스트를 붙여넣어 주세요.",
    );
  const blocks: { label: string; body: string[]; inline?: string[] }[] = [];
  for (const s of lines.slice(heading + 1, end)) {
    // OCR may confuse the final digit of a three-character POS item number (e.g. 00E).
    const m = /^\d{2}[\dA-Z]\s+(.+)$/.exec(s);
    if (m && /[가-힣A-Za-z]/.test(m[1])) {
      // Camera OCR often keeps the price columns on the same printed row.
      const row = /^(.+?)\s+([\d,]+)\s+(-?\d+)\s+(-?[\d,]+)$/.exec(m[1]);
      blocks.push({ label: row?.[1] ?? m[1], body: [], inline: row?.slice(2) });
    } else blocks.at(-1)?.body.push(s);
  }
  if (!blocks.length || blocks.length > 100)
    throw new Error(
      "번호가 붙은 상품 줄을 찾을 수 없습니다. 직접 입력해 주세요.",
    );
  const items: OcrItem[] = [];
  const loosePrices = new Set<number>();
  let couponCount = 0,
    verifiedCoupons = 0,
    discount = 0;
  for (const { label, body, inline } of blocks) {
    if (/쿠폰|할인/.test(label)) {
      couponCount++;
      const prices = inline ?? body;
      for (let i = 0; i < prices.length; i++) {
        const unit = number(prices[i]),
          qty = number(prices[i + 1]),
          total = number(prices[i + 2]);
        if (
          unit !== null &&
          unit > 0 &&
          qty !== null &&
          qty < 0 &&
          total === unit * qty
        ) {
          verifiedCoupons++;
          discount -= total;
          i += 2;
        } else if (unit !== null && unit > 0 && prices[i].includes(","))
          loosePrices.add(unit);
      }
      continue;
    }
    // A barcode anchors the price column. Only accept an isolated unit × qty = total
    // immediately following it; displaced numbers are hints, not line allocations.
    const barcode = body.findIndex((s) => /^\d{6,14}$/.test(s));
    let amount: number | null = null,
      quantity: number | null = null;
    const tail = inline ?? (barcode < 0 ? [] : body.slice(barcode + 1));
    const [u, q, t] = tail.map((s) => number(s));
    if (
      tail.length === 3 &&
      u != null &&
      q != null &&
      t != null &&
      u >= 0 &&
      q >= 1 &&
      q <= 10000 &&
      u * q === t
    ) {
      amount = t;
      quantity = q;
    } else {
      for (const s of tail) {
        const n = number(s);
        if (s.includes(",") && n !== null && n > 0) loosePrices.add(n);
      }
    }
    const continuation =
      barcode === 1 && /^\d{2}$/.test(body[0]) ? " " + body[0] : "";
    items.push({ label: label + continuation, amount, quantity });
  }
  if (!items.length) throw new Error("와인 상품 줄을 찾지 못했습니다.");
  const paidValues = new Set<number>();
  for (let i = end; i < lines.length; i++) {
    const m = /^(?:합계액\s*:?|카\s*드\s*:|\[승인금액\])\s*(.*)$/.exec(
      lines[i],
    );
    if (m) {
      const n = number((m[1] || lines[i + 1] || "").split(/\s/)[0]);
      if (n !== null && n >= 0) paidValues.add(n);
    }
  }
  return {
    merchant:
      heading > 0 && /^[가-힣A-Za-z0-9 ()·&.-]{2,80}$/.test(lines[0])
        ? lines[0]
        : null,
    date: receiptDate(lines.join("\n")),
    paid: paidValues.size === 1 ? [...paidValues][0] : null,
    discount: verifiedCoupons === couponCount ? discount : null,
    items,
    loosePrices: [...loosePrices],
  };
}
