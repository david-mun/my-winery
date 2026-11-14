import { WineForm } from "@/components/forms";
export default function NewWine() {
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
        <WineForm />
      </section>
    </>
  );
}
