import type { ReceiptWineDetails } from "@/lib/analysis/contracts";
import { Button } from "@/components/ui/button";

export function ReceiptWineSuggestion({
  details,
  onChoose,
}: {
  details: ReceiptWineDetails;
  onChoose: () => void;
}) {
  const alcohol = details.alcohol_percent;
  return (
    <aside
      className="auth-notice"
      aria-label="AI 와인 후보"
      style={{ overflowWrap: "anywhere" }}
    >
      <strong>AI 와인 후보 · 확인 필요</strong>
      <dl>
        <dt>한글 이름</dt>
        <dd>{details.name_ko ?? "미확인"}</dd>
        <dt>영문 이름</dt>
        <dd>{details.name_en ?? "미확인"}</dd>
        <dt>생산자</dt>
        <dd>{details.producer ?? "미확인"}</dd>
        <dt>원산지</dt>
        <dd>
          {[details.country, details.region].filter(Boolean).join(" · ") ||
            "미확인"}
        </dd>
        <dt>품종</dt>
        <dd>{details.grapes.join(", ") || "미확인"}</dd>
        <dt>도수</dt>
        <dd>
          {alcohol
            ? `${alcohol.min}${alcohol.min === alcohol.max ? "" : `~${alcohol.max}`}%`
            : "미확인"}
        </dd>
      </dl>
      <p>상품명으로 추정한 정보입니다. 실제 라벨과 대조해 주세요.</p>
      {details.summary_ko && <p>{details.summary_ko}</p>}
      {details.notes && <p>{details.notes}</p>}
      <Button type="button" variant="outline" onClick={onChoose}>
        후보 와인명 사용
      </Button>
    </aside>
  );
}
