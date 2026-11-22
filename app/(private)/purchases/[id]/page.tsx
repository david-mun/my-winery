import Link from "next/link";
import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { DeletePhoto } from "@/components/delete-photo";
import { collection } from "@/lib/data";
import { won } from "@/lib/domain";
import { ReceiptForm, DeleteButton, MediaForm } from "@/components/forms";
export default async function Receipt({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photo?: string; bottle?: string }>;
}) {
  const { db } = await pageUser(),
    { id } = await params,
    data = await collection(db),
    receipt = data.receipts.find((r) => r.id === id);
  if (!receipt) notFound();
  const notice = await searchParams;
  const lines = data.lines
    .filter((l) => l.receipt_id === id)
    .sort((a, b) => a.line_no - b.line_no);
  const initial = {
    ...receipt,
    lines: lines
      .filter((l) => l.line_kind !== "discount")
      .map((l) => ({
        line_kind: l.line_kind as "wine" | "bundle",
        line_amount: l.line_amount,
        raw_label: l.raw_label,
        notes: l.notes ?? null,
        wines: data.links
          .filter((x) => x.receipt_line_id === l.id)
          .map((x) => ({
            wine_id: x.wine_id,
            vintage_label: x.vintage_label,
            bottle_quantity: x.bottle_quantity,
          })),
      })),
  };
  return (
    <>
      <p className="eyebrow">RECEIPT</p>
      <h1>{receipt.purchased_on} 구매</h1>
      <section className="panel">
        <h2>실결제 {won(receipt.paid_amount)}</h2>
        {notice.bottle === "retry" && (
          <p role="alert">
            구매는 저장됐지만 일부 병 사진을 첨부하지 못했습니다. 와인 이름을
            눌러 사진만 다시 올려 주세요.
          </p>
        )}
        {lines.map((l) => (
          <div className="record-row" key={l.id}>
            <div>
              <strong>{l.raw_label}</strong>
              {data.links
                .filter((x) => x.receipt_line_id === l.id)
                .map((x) => (
                  <div key={x.id}>
                    {data.assets
                      .filter((a) => a.wine_id === x.wine_id)
                      .slice(0, 1)
                      .map((a) => (
                        <div key={a.id}>
                          {/* Owner-checked private image; do not proxy through a shared optimizer. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={"/api/media/" + a.id}
                            alt="구매한 와인 병 사진"
                            width="72"
                            style={{ maxHeight: 100, objectFit: "contain" }}
                          />
                          {a.photo_credit && (
                            <small>
                              <a href={a.photo_credit.page}>
                                {a.photo_credit.title}
                              </a>{" "}
                              · {a.photo_credit.author} ·{" "}
                              <a href={a.photo_credit.licenseUrl}>
                                {a.photo_credit.license}
                              </a>{" "}
                              · WebP 변환
                            </small>
                          )}
                          <DeletePhoto id={a.id} kind="wine" />
                        </div>
                      ))}
                    <Link className="text-link" href={"/wines/" + x.wine_id}>
                      {data.wines.find((w) => w.id === x.wine_id)?.name_ko}
                    </Link>{" "}
                    · {x.bottle_quantity}병
                    {x.allocated_amount === null ? " · 병별 가격 미확인" : ""}
                  </div>
                ))}
            </div>
            <strong>{won(l.line_amount)}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>구매 사진 · 영수증 / 와인</h2>
        {notice.photo === "retry" && (
          <p role="alert">
            구매는 저장됐지만 사진 첨부에 실패했습니다. 아래에서 사진만 다시
            첨부해 주세요.
          </p>
        )}
        <MediaForm
          kind="receipt"
          target={id}
          assets={data.assets.filter((a) => a.receipt_id === id)}
        />
      </section>
      <section className="panel">
        <details>
          <summary className="text-link">구매 기록 수정</summary>
          <ReceiptForm data={data} initial={initial} />
        </details>
      </section>
      <DeleteButton
        url={"/api/purchases/" + id}
        body={{ version: receipt.version }}
        warning={`${receipt.purchased_on} · ${won(receipt.paid_amount)} 영수증과 연결 구매/이미지를 삭제할까요? 와인과 독립 시음 노트는 유지됩니다.`}
        redirect="/purchases"
        label="영수증 삭제"
      />
    </>
  );
}
