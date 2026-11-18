import { WineForm } from "@/components/forms";
import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
export default async function NewWine() {
  const { db } = await pageUser();
  const data = await collection(db);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">NEW WINE</p>
          <h1>새로운 와인 기록</h1>
          <p className="subtitle">
            같은 와인은 기존 상세 화면에서 구매 기록만 추가하세요.
          </p>
        </div>
      </div>
      <section className="panel">
        <WineForm existingWines={data.wines} />
      </section>
    </>
  );
}
