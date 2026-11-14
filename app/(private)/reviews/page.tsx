import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
export default async function Reviews() {
  const { db } = await pageUser(),
    data = await collection(db);
  return (
    <>
      <p className="eyebrow">TASTING JOURNAL</p>
      <h1>나의 시음 노트</h1>
      <p className="subtitle">그날의 향과 맛, 그리고 기억.</p>
      <section className="panel">
        {data.notes.map((n) => (
          <Link className="record-row" key={n.id} href={"/wines/" + n.wine_id}>
            <div>
              <strong>
                {data.wines.find((w) => w.id === n.wine_id)?.name_ko}
              </strong>
              <p className="review-text">
                {n.review_text || "평점만 기록한 노트"}
              </p>
              <p>{n.tasted_on ?? "시음일 미기재"}</p>
            </div>
            <strong>★ {n.my_rating?.toFixed(1) ?? "—"}</strong>
          </Link>
        ))}
        {!data.notes.length && (
          <p>와인 상세 화면에서 첫 시음 노트를 남겨보세요.</p>
        )}
      </section>
    </>
  );
}
