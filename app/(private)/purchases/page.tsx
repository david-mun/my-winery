import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
import { won } from "@/lib/domain";
import { Button } from "@/components/ui/button";
export default async function Purchases() {
  const { db } = await pageUser(),
    data = await collection(db);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PURCHASE HISTORY</p>
          <h1>구매 내역</h1>
          <p className="subtitle">
            영수증 {data.receipts.length}건 · 실결제{" "}
            {won(data.receipts.reduce((s, r) => s + r.paid_amount, 0))}
          </p>
        </div>
        <Button asChild>
          <Link href="/purchases/new">구매 기록 추가</Link>
        </Button>
      </div>
      <section className="panel">
        {data.receipts
          .sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))
          .map((r) => (
            <Link className="record-row" href={"/purchases/" + r.id} key={r.id}>
              <div>
                <strong>{r.purchased_on}</strong>
                <p>
                  {data.merchants.find((m) => m.id === r.merchant_id)?.name ??
                    "구매처 미기재"}
                </p>
              </div>
              <strong>{won(r.paid_amount)} →</strong>
            </Link>
          ))}
        {!data.receipts.length && (
          <p className="muted">아직 구매 기록이 없습니다.</p>
        )}
      </section>
    </>
  );
}
