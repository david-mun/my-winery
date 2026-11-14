import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
import { WineDetail } from "@/components/wines";
import {
  WineForm,
  NoteForm,
  RatingForm,
  DeleteButton,
  MediaForm,
} from "@/components/forms";
export default async function Detail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db } = await pageUser(),
    { id } = await params,
    data = await collection(db),
    wine = data.wines.find((w) => w.id === id);
  if (!wine) notFound();
  return (
    <WineDetail data={data} id={id}>
      <section className="panel">
        <h2>나의 시음 노트</h2>
        {data.notes
          .filter((n) => n.wine_id === id)
          .map((n) => (
            <div className="record-row" key={n.id}>
              <div style={{ width: "100%" }}>
                <strong>
                  ★ {n.my_rating?.toFixed(1) ?? "평점 없음"} ·{" "}
                  {n.tasted_on ?? "시음일 미기재"}
                </strong>
                <p className="review-text">{n.review_text}</p>
                <details>
                  <summary className="text-link">노트 수정</summary>
                  <NoteForm wineId={id} note={n} />
                </details>
                <DeleteButton
                  url={"/api/reviews/" + n.id}
                  warning="이 시음 노트를 삭제할까요?"
                />
              </div>
            </div>
          ))}
        <details open={!data.notes.some((n) => n.wine_id === id)}>
          <summary className="text-link">새 시음 노트 작성</summary>
          <NoteForm wineId={id} />
        </details>
      </section>
      <section className="panel">
        <h2>와인 사진</h2>
        <MediaForm
          kind="wine"
          target={id}
          assets={data.assets.filter((a) => a.wine_id === id)}
        />
      </section>
      <section className="panel">
        <details>
          <summary className="text-link">외부 평점 관측 추가</summary>
          <RatingForm wineId={id} />
        </details>
      </section>
      <section className="panel">
        <details>
          <summary className="text-link">와인 정보 수정</summary>
          <WineForm wine={wine} />
        </details>
      </section>
      <DeleteButton
        url={"/api/wines/" + id}
        label="와인 삭제"
        warning="연결된 구매가 없을 때만 삭제할 수 있습니다. 이 와인의 후기와 사진도 삭제됩니다. 계속할까요?"
        redirect="/wines"
      />
    </WineDetail>
  );
}
