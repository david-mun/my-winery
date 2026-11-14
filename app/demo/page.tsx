import { Shell } from "@/components/shell";
import { WineList, WineDetail } from "@/components/wines";
import { ReceiptForm } from "@/components/forms";
import { demoCollection } from "@/lib/demo";
import { won } from "@/lib/domain";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const p = await searchParams,
    data = demoCollection();
  return (
    <Shell demo>
      {p.wine ? (
        <WineDetail data={data} id={p.wine} demo />
      ) : p.view === "purchases" ? (
        <>
          <h1>구매 내역 · 가상 예시</h1>
          <section className="panel">
            <p>예시 실결제 {won(data.receipts[0].paid_amount)}</p>
            <p>
              아래에서 구매 입력과 금액 검증을 체험할 수 있습니다. 저장은 하지
              않습니다.
            </p>
            <ReceiptForm data={data} demo />
          </section>
        </>
      ) : p.view === "reviews" ? (
        <>
          <h1>시음 노트 · 가상 예시</h1>
          <section className="panel">
            <h2>{data.wines[0].name_ko}</h2>
            <p>{data.notes[0].review_text}</p>
          </section>
        </>
      ) : p.view === "settings" ? (
        <>
          <h1>미리보기 안내</h1>
          <section className="panel">
            이 화면은 가상 데이터만 사용합니다. 실제 개인 셀러는 초대 후
            로그인해야 사용할 수 있습니다.
          </section>
        </>
      ) : (
        <WineList
          data={data}
          demo
          filters={{ ...p, type: p.type ? [p.type] : [] }}
        />
      )}
    </Shell>
  );
}
