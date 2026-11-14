import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { receiptInput, validVivinoUrl, type WineType } from "../lib/domain";
import { identityKey } from "../lib/security";
export function stableId(value: string) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export function snapshot(
  root = "data",
  owner = "00000000-0000-4000-a000-000000000001",
) {
  const files = [
    "wine_purchase_rows.csv",
    "receipt_totals.csv",
    "source_manifest.json",
  ];
  const bytes = files.map((f) => readFileSync(`${root}/${f}`));
  const checksum = createHash("sha256");
  files.forEach((f, i) => checksum.update(f).update(bytes[i]));
  const rows = parse(bytes[0], { columns: true, bom: true }) as Record<
    string,
    string
  >[];
  const totals = parse(bytes[1], { columns: true, bom: true }) as Record<
    string,
    string
  >[];
  const manifest = JSON.parse(bytes[2].toString());
  const source = manifest.source.source_file_id;
  const key = (s: string) => stableId(owner + ":" + source + ":" + s);
  const wineNames = [...new Set(rows.map((r) => r.wine_name))];
  const wines = wineNames.map((name) => {
    const r = rows.find((r) => r.wine_name === name)!;
    const [country, ...regions] = r.region.split(" · ");
    const type: WineType = r.wine_type.startsWith("스파클링")
      ? "sparkling"
      : r.wine_type.startsWith("레드")
        ? "red"
        : "white";
    const grape = r.wine_type.split(" · ")[1];
    return {
      id: key("wine:" + name),
      identity_key: identityKey(name, null),
      name_ko: name,
      name_original: null,
      producer: null,
      wine_type: type,
      grape: grape === "크레망" ? null : (grape ?? null),
      country,
      region: regions.join(" · "),
      description: grape === "크레망" ? "크레망" : null,
    };
  });
  const merchants = [...new Set(rows.map((r) => r.purchase_place))].map(
    (name) => ({ id: key("merchant:" + name), name }),
  );
  const receipts = totals.map((t, i) => {
    const purchased = rows.filter((r) => r.purchased_on === t.purchased_on);
    const ordinary = purchased.filter((r) => r.unit_price_krw);
    const bundle = purchased.filter((r) => !r.unit_price_krw);
    const link = (r: Record<string, string>) => ({
      wine_id: key("wine:" + r.wine_name),
      vintage_label: r.vintage === "미표기" ? "UNKNOWN" : r.vintage,
      bottle_quantity: 1,
    });
    const lines = ordinary.map((r) => ({
      line_kind: "wine" as "wine" | "bundle",
      raw_label: r.receipt_product_name,
      line_amount: Number(r.unit_price_krw),
      notes: r.notes || null,
      wines: [link(r)],
    }));
    if (bundle.length)
      lines.push({
        line_kind: "bundle",
        raw_label: bundle[0].receipt_product_name,
        line_amount: Number(t.bundle_amount_krw),
        notes: bundle.map((r) => r.notes).join("\n"),
        wines: bundle.map(link),
      });
    const payload = {
      merchant_id: merchants.find(
        (m) => m.name === purchased[0].purchase_place,
      )!.id,
      purchased_on: t.purchased_on,
      paid_amount: Number(t.paid_amount_krw),
      discount_amount: Number(t.discount_amount_krw),
      notes: null,
      lines,
    };
    receiptInput.parse(payload);
    return { ...payload, source_key: `${source}:receipt_totals.csv:${i + 1}` };
  });
  const ratings: Record<string, unknown>[] = [];
  const seen = new Map<string, string>();
  const notes: Record<string, unknown>[] = [];
  const importRows = rows.map((r) => {
    if (!validVivinoUrl(r.vivino_url)) throw new Error("Invalid source URL");
    const scope =
      r.vivino_rating_scope === "전체 빈티지"
        ? "ALL_VINTAGES"
        : r.vivino_rating_scope === "NV"
          ? "NV"
          : "VINTAGE";
    const ratingVintage =
      scope === "VINTAGE"
        ? r.vivino_rating_scope.slice(0, 4)
        : scope === "NV"
          ? "NV"
          : "UNKNOWN";
    const rk = [
      r.wine_name,
      scope,
      ratingVintage,
      r.vivino_url,
      r.vivino_rating_out_of_5,
      "2026-10-11",
    ].join("|");
    let ratingId = seen.get(rk);
    if (!ratingId) {
      ratingId = key("rating:" + rk);
      seen.set(rk, ratingId);
      ratings.push({
        id: ratingId,
        wine_id: key("wine:" + r.wine_name),
        source: "vivino",
        score: Number(r.vivino_rating_out_of_5),
        rating_scope: scope,
        vintage_label: ratingVintage,
        checked_on: "2026-10-11",
        source_url: r.vivino_url,
        source_row: Number(r.source_row),
        verification_status:
          r.wine_name === "조지 미쉘 소비뇽 블랑"
            ? "needs_review"
            : "unverified",
        notes: r.notes || null,
      });
    }
    let noteId: null | string = null;
    if (r.my_rating_out_of_5 || r.my_review) {
      noteId = key("note:" + r.source_row);
      notes.push({
        id: noteId,
        wine_id: key("wine:" + r.wine_name),
        vintage_label: r.vintage === "미표기" ? "UNKNOWN" : r.vintage,
        my_rating: r.my_rating_out_of_5 ? Number(r.my_rating_out_of_5) : null,
        review_text: r.my_review || null,
        tasted_on: null,
      });
    }
    const receipt = receipts.find((x) => x.purchased_on === r.purchased_on)!;
    const lineNo =
      receipt.lines.findIndex((l) =>
        l.wines.some((w) => w.wine_id === key("wine:" + r.wine_name)),
      ) + 1;
    return {
      source_row: Number(r.source_row),
      raw_json: r,
      row_checksum: createHash("sha256")
        .update(JSON.stringify(r))
        .digest("hex"),
      targets: {
        wine_id: key("wine:" + r.wine_name),
        rating_id: ratingId,
        note_id: noteId,
        receipt_source_key: receipt.source_key,
        line_no: lineNo,
      },
    };
  });
  const report = {
    wines: wines.length,
    bottles: rows.length,
    receipts: receipts.length,
    paid: receipts.reduce((s, r) => s + r.paid_amount, 0),
    ratings: ratings.length,
    notes: notes.length,
    media: 0,
  };
  if (
    JSON.stringify(report) !==
    JSON.stringify({
      wines: 10,
      bottles: 12,
      receipts: 2,
      paid: 293900,
      ratings: 11,
      notes: 5,
      media: 0,
    })
  )
    throw new Error("Snapshot counts mismatch");
  for (const r of receipts) {
    if (r.paid_amount !== manifest.validation.paid_by_date_krw[r.purchased_on])
      throw new Error("Receipt total mismatch");
  }
  if (
    receipts[0].lines.filter((l) => l.line_kind === "bundle").length !== 1 ||
    receipts[0].lines.find((l) => l.line_kind === "bundle")?.line_amount !==
      39900 ||
    receipts[1].discount_amount !== 18000
  )
    throw new Error("Bundle/discount mismatch");
  return {
    source_file_id: source,
    source_name: manifest.source.drive_title,
    source_tab: manifest.source.sheet_tab,
    checksum: checksum.digest("hex"),
    wines,
    merchants,
    receipts,
    ratings,
    notes,
    rows: importRows,
    report,
  };
}
