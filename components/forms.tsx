"use client";
/* Private signed images deliberately bypass the shared Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { PhotoAnalysis } from "./analysis/photo-analysis";
import {
  visibleDescription,
  preserveDescriptionMetadata,
} from "@/lib/wine-description";
import { ReceiptWineSuggestion } from "./analysis/receipt-wine-details";
import {
  wineDescription,
  wineDisplayName,
  type AnalysisResult,
  type ReceiptAnalysis,
  type ReceiptWineDetails,
} from "@/lib/analysis/contracts";
import { WinePhotoInput, type BottlePhoto } from "./wine-photo-input";
import { DeletePhoto } from "./delete-photo";
import { CatalogPicker } from "./catalog-picker";
import { prepareUpload } from "@/lib/image-client";
import {
  useState,
  useId,
  cloneElement,
  isValidElement,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Wine as WineIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "./ui/button";
import {
  wineTypes,
  today,
  won,
  receiptInput,
  type Wine,
  type Note,
  type Collection,
  type ReceiptInput,
  type Asset,
} from "@/lib/domain";
export async function request(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error ?? "요청에 실패했습니다.");
  return result;
}
const string = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const optional = (f: FormData, k: string) => string(f, k) || null;
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div className={`field${wide ? " wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {isValidElement<{ id?: string }>(children)
        ? cloneElement(children, { id })
        : children}
    </div>
  );
}
function useSave() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const router = useRouter();
  async function save(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, setMessage, save, router };
}
export function AuthForm({
  flow = "login",
  notice = "",
}: {
  flow?: "login" | "invite" | "recovery";
  notice?: string;
}) {
  const state = useSave();
  const [reset, setReset] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await state.save(async () => {
      if (flow !== "login") {
        if (string(f, "password") !== string(f, "confirm"))
          throw new Error("비밀번호가 일치하지 않습니다.");
        await request("/api/auth/password", "POST", {
          password: string(f, "password"),
          flow,
        });
        state.router.push("/wines");
      } else {
        await request(`/api/auth/${reset ? "reset" : "login"}`, "POST", {
          email: string(f, "email"),
          password: string(f, "password"),
        });
        if (reset)
          state.setMessage("등록된 계정이라면 재설정 메일이 발송됩니다.");
        else state.router.push("/wines");
      }
    });
  }
  return (
    <div className="auth-page">
      <div className="auth-art">
        <p className="eyebrow">A LITTLE CELLAR, ALL YOURS.</p>
        <div className="bottle-art">
          <div className="bottle-neck" />
          <div className="bottle-body">
            <div className="bottle-label">
              <span>MW</span>
              <i>PRIVATE SELECTION</i>
            </div>
          </div>
        </div>
        <h2>A story in every bottle.</h2>
        <p className="muted">
          좋았던 와인과 그날의 기억을
          <br />
          나만의 공간에 남겨보세요.
        </p>
      </div>
      <main className="auth-form-area" id="main-content">
        <div className="auth-form">
          <Link className="brand" href="/login">
            <WineIcon />
            MY WINE LIST
          </Link>
          <h1>
            {flow === "invite"
              ? "나만의 셀러에 오신 것을 환영해요"
              : flow === "recovery"
                ? "새 비밀번호 설정"
                : reset
                  ? "비밀번호 재설정"
                  : "반가워요, 다시 만나서"}
          </h1>
          <p className="subtitle">
            {flow === "login"
              ? "초대받은 이메일로 로그인해 주세요."
              : "12자 이상의 새 비밀번호를 설정해 주세요."}
          </p>
          {notice && <p className="auth-notice">{notice}</p>}
          <form onSubmit={submit}>
            {flow === "login" && (
              <Field label="이메일">
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                />
              </Field>
            )}
            {!reset && (
              <Field label="비밀번호">
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    flow === "login" ? "current-password" : "new-password"
                  }
                  minLength={flow === "login" ? 1 : 12}
                  maxLength={128}
                  required
                />
              </Field>
            )}
            {flow !== "login" && (
              <Field label="비밀번호 확인">
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </Field>
            )}
            <p className="form-message" role="status">
              {state.message}
            </p>
            <Button disabled={state.busy}>
              {state.busy
                ? "처리 중…"
                : flow !== "login"
                  ? "비밀번호 저장"
                  : reset
                    ? "재설정 메일 받기"
                    : "로그인"}
            </Button>
          </form>
          {flow === "login" && (
            <Button variant="ghost" onClick={() => setReset(!reset)}>
              {reset ? "로그인으로 돌아가기" : "비밀번호를 잊으셨나요?"}
            </Button>
          )}
          <Link className="demo-link" href="/demo">
            가상 컬렉션 미리보기 →
          </Link>
        </div>
      </main>
    </div>
  );
}
export function WineForm({
  wine,
  existingWines = [],
}: {
  wine?: Wine;
  existingWines?: Wine[];
}) {
  const s = useSave();
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [values, setValues] = useState({
    name_ko: wine?.name_ko ?? "",
    name_original: wine?.name_original ?? "",
    producer: wine?.producer ?? "",
    wine_type: wine?.wine_type ?? "",
    country: wine?.country ?? "",
    region: wine?.region ?? "",
    grape: wine?.grape ?? "",
    description: visibleDescription(wine?.description),
  });
  const [photo, setPhoto] = useState<File | null>(null),
    [attach, setAttach] = useState(true);
  const [reviewRequired, setReviewRequired] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const normalize = (v: string) =>
    v.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  const duplicate =
    !wine &&
    !savedId &&
    existingWines.find((w) =>
      [w.name_ko, w.name_original]
        .filter(Boolean)
        .some((name) =>
          [values.name_ko, values.name_original]
            .filter(Boolean)
            .some((n) => normalize(name!) === normalize(n)),
        ),
    );
  function apply(result: AnalysisResult) {
    if (result.task !== "wine-label" || !result.analysis.wine) return;
    if (
      Object.values(values).some(Boolean) &&
      !confirm("분석한 초안으로 현재 입력 내용을 교체할까요?")
    )
      return;
    const w = result.analysis.wine;
    setValues({
      name_ko: wineDisplayName(w),
      name_original: wineDisplayName(w),
      producer: w.producer ?? "",
      wine_type: w.wine_type ?? "",
      country: w.country ?? "",
      region: w.region ?? "",
      grape: w.grapes.join(", "),
      description: wineDescription(w),
    });
    setReviewRequired(true);
    setReviewed(false);
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (duplicate || (reviewRequired && !reviewed)) return;
        void s.save(async () => {
          let id = savedId;
          if (!id) {
            const value = {
              ...values,
              ...Object.fromEntries(
                Object.entries(values)
                  .filter(([key]) => !["name_ko", "wine_type"].includes(key))
                  .map(([key, value]) => [key, value.trim() || null]),
              ),
            };
            const result = await request(
              `/api/wines${wine ? "/" + wine.id : ""}`,
              wine ? "PATCH" : "POST",
              {
                ...value,
                description: preserveDescriptionMetadata(
                  value.description,
                  wine?.description,
                ),
              },
            );
            id = result.id;
            setSavedId(id);
          }
          if (photo && attach) {
            try {
              const upload = new FormData();
              upload.set("kind", "wine");
              upload.set("target", id!);
              upload.set("file", photo);
              await request("/api/media", "POST", upload);
            } catch {
              s.setMessage(
                "와인은 저장됐지만 사진 첨부에 실패했습니다. 다시 눌러 사진만 재시도하거나 상세로 이동하세요.",
              );
              return;
            }
          }
          s.router.push("/wines/" + id);
        });
      }}
    >
      {!wine && !savedId && (
        <PhotoAnalysis
          task="wine-label"
          disabled={s.busy}
          onFile={setPhoto}
          onBusyChange={setAnalysisBusy}
          onApply={apply}
        />
      )}
      {photo && !savedId && (
        <label className="filter-check">
          <input
            type="checkbox"
            checked={attach}
            onChange={(e) => setAttach(e.target.checked)}
          />
          와인 저장 시 이 사진도 비공개로 첨부
        </label>
      )}
      <div className="form-grid">
        <Field label="와인 이름 *">
          <input
            name="name_ko"
            required
            maxLength={200}
            value={values.name_ko}
            onChange={(e) => setValues({ ...values, name_ko: e.target.value })}
          />
        </Field>
        <Field label="종류">
          <select
            name="wine_type"
            required
            value={values.wine_type}
            onChange={(e) =>
              setValues({ ...values, wine_type: e.target.value })
            }
          >
            <option value="">종류 확인 필요</option>
            {Object.entries(wineTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        {(
          [
            ["name_original", "원어 이름"],
            ["producer", "생산자"],
            ["country", "국가"],
            ["region", "지역"],
            ["grape", "품종"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              maxLength={200}
              value={values[key]}
              onChange={(e) => setValues({ ...values, [key]: e.target.value })}
            />
          </Field>
        ))}
        <Field label="와인 설명" wide>
          <textarea
            name="description"
            maxLength={5000}
            value={values.description}
            onChange={(e) =>
              setValues({ ...values, description: e.target.value })
            }
          />
        </Field>
      </div>
      {duplicate && (
        <p role="status">
          같은 이름의 와인이 이미 있습니다.{" "}
          <Link className="text-link" href={"/wines/" + duplicate.id}>
            기존 와인 확인
          </Link>
        </p>
      )}
      {reviewRequired && (
        <label className="filter-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          원본 라벨과 와인 상세를 확인했습니다.
        </label>
      )}
      <div className="form-actions">
        <Button
          disabled={
            s.busy ||
            analysisBusy ||
            !!duplicate ||
            (reviewRequired && !reviewed)
          }
        >
          {s.busy ? "저장 중…" : savedId ? "사진 다시 첨부" : "와인 저장"}
        </Button>
        <span role="status" className="form-message">
          {s.message}
        </span>
        {savedId && (
          <Link href={"/wines/" + savedId} className="text-link">
            저장한 와인 상세
          </Link>
        )}
      </div>
    </form>
  );
}
export function DeleteButton({
  url,
  label = "삭제",
  warning,
  body,
  redirect,
}: {
  url: string;
  label?: string;
  warning: string;
  body?: unknown;
  redirect?: string;
}) {
  const s = useSave();
  return (
    <div>
      <Button
        variant="danger"
        disabled={s.busy}
        onClick={() => {
          if (confirm(warning))
            s.save(async () => {
              await request(url, "DELETE", body);
              if (redirect) s.router.push(redirect);
            });
        }}
      >
        <Trash2 size={15} />
        {label}
      </Button>
      <p role="status" className="form-message">
        {s.message}
      </p>
    </div>
  );
}
export function NoteForm({ wineId, note }: { wineId: string; note?: Note }) {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          await request(
            `/api/reviews${note ? "/" + note.id : ""}`,
            note ? "PATCH" : "POST",
            {
              wine_id: wineId,
              vintage_label: note?.vintage_label ?? "UNKNOWN",
              my_rating: string(f, "my_rating")
                ? Number(string(f, "my_rating"))
                : null,
              review_text: optional(f, "review_text"),
              tasted_on: optional(f, "tasted_on"),
            },
          );
          s.setMessage("시음 노트를 저장했습니다.");
        });
      }}
    >
      <div className="form-grid">
        <Field label="내 평점">
          <input
            type="number"
            inputMode="decimal"
            name="my_rating"
            min="1"
            max="5"
            step="0.1"
            placeholder="1.0~5.0"
            defaultValue={note?.my_rating?.toFixed(1) ?? ""}
          />
        </Field>
        <Field label="시음일 (선택)">
          <input
            name="tasted_on"
            type="date"
            max={today()}
            defaultValue={note?.tasted_on ?? ""}
          />
        </Field>
        <Field label="후기" wide>
          <textarea
            name="review_text"
            maxLength={5000}
            placeholder="향과 맛, 함께한 순간을 기록해 보세요."
            defaultValue={note?.review_text ?? ""}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Button disabled={s.busy}>시음 노트 저장</Button>
        <span role="status" className="form-message">
          {s.message}
        </span>
      </div>
    </form>
  );
}
export function RatingForm({ wineId }: { wineId: string }) {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          await request("/api/ratings", "POST", {
            wine_id: wineId,
            source: "vivino",
            score: Number(string(f, "score")),
            rating_scope: "ALL_VINTAGES",
            checked_on: string(f, "checked_on"),
            source_url: string(f, "source_url"),
            verification_status: string(f, "verification_status"),
            notes: optional(f, "notes"),
          });
          s.setMessage("외부 평점 관측을 추가했습니다.");
        });
      }}
    >
      <div className="form-grid">
        <Field label="Vivino 점수">
          <input
            type="number"
            name="score"
            min="0"
            max="5"
            step="0.1"
            required
          />
        </Field>
        <Field label="확인일">
          <input
            name="checked_on"
            type="date"
            max={today()}
            required
            defaultValue={today()}
          />
        </Field>
        <Field label="Vivino URL" wide>
          <input
            name="source_url"
            type="url"
            required
            placeholder="https://www.vivino.com/…"
          />
        </Field>
        <Field label="상품 매칭 상태">
          <select name="verification_status">
            <option value="unverified">미검증</option>
            <option value="verified">직접 확인됨</option>
            <option value="needs_review">매칭 확인 필요</option>
          </select>
        </Field>
        <Field label="메모" wide>
          <textarea name="notes" maxLength={5000} />
        </Field>
      </div>
      <div className="form-actions">
        <Button disabled={s.busy}>관측 추가</Button>
        <span role="status" className="form-message">
          {s.message}
        </span>
      </div>
    </form>
  );
}
type InputLine = ReceiptInput["lines"][number];
type EditorLine = Omit<InputLine, "line_amount" | "wines"> & {
  labelEdited?: boolean;
  line_amount: number | "";
  wines: (Omit<InputLine["wines"][number], "bottle_quantity"> & {
    bottle_quantity: number | "";
    bottlePhoto?: BottlePhoto;
    catalogOriginal?: string;
    analysisDetails?: ReceiptWineDetails | null;
  })[];
};
export function ReceiptForm({
  data,
  initial,
  wineId,
  demo = false,
}: {
  data: Collection;
  initial?: ReceiptInput;
  wineId?: string;
  demo?: boolean;
}) {
  const s = useSave();
  const defaultLine = () => ({
    line_kind: "wine" as "wine" | "bundle",
    raw_label: wineId
      ? (data.wines.find((w) => w.id === wineId)?.name_ko ?? "")
      : "",
    line_amount: 0,
    wines: [
      {
        wine_id: wineId,
        vintage_label: "UNKNOWN",
        bottle_quantity: 1,
      },
    ],
  });
  const [lines, setLines] = useState<EditorLine[]>(
      initial?.lines ?? [defaultLine()],
    ),
    [discount, setDiscount] = useState<number | "">(
      initial?.discount_amount ?? 0,
    ),
    [paid, setPaid] = useState<number | "">(initial?.paid_amount ?? 0);
  const [date, setDate] = useState(initial?.purchased_on ?? today());
  const [merchant, setMerchant] = useState(initial?.merchant_id ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [attachPhoto, setAttachPhoto] = useState(true);
  const [draft, setDraft] = useState<ReceiptAnalysis | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [composingLine, setComposingLine] = useState<number | null>(null);
  function applyAnalysis(result: AnalysisResult) {
    if (result.task !== "receipt") return;
    if (!confirm("분석한 초안으로 현재 구매 입력 내용을 교체할까요?")) return;
    const value = result.analysis;
    setLines(
      value.lines.map((line) => ({
        line_kind: line.kind as "wine" | "bundle",
        raw_label: line.raw_label,
        line_amount: line.amount ?? "",
        wines: line.wines.map((w) => {
          const name = w.name ?? line.raw_label;
          const matches = data.wines.filter(
            (x) => x.name_ko === name || x.name_original === name,
          );
          return {
            wine_id: matches.length === 1 ? matches[0].id : undefined,
            wine_name: matches.length === 1 ? undefined : name,
            vintage_label: w.vintage_label,
            bottle_quantity: w.quantity ?? "",
            analysisDetails: w.details,
          };
        }),
      })),
    );
    setDate(value.purchased_on ?? "");
    setPaid(value.paid_amount ?? "");
    setDiscount(value.discount_amount ?? "");
    setMerchant(
      data.merchants.find((m) => m.name === value.merchant)?.id ?? "",
    );
    setDraft(value);
    setReviewed(false);
    s.setMessage("");
  }
  const duplicate =
    draft &&
    data.receipts.find(
      (r) => r.purchased_on === date && r.paid_amount === paid,
    );
  const change = (i: number, update: Partial<EditorLine>) =>
    setLines((old) => old.map((l, k) => (k === i ? { ...l, ...update } : l)));
  const amountsComplete =
    paid !== "" && discount !== "" && lines.every((l) => l.line_amount !== "");
  const sum =
    lines.reduce((s, l) => s + Number(l.line_amount), 0) - Number(discount);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!amountsComplete || (draft && !reviewed)) return;
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          const payload = receiptInput.parse({
            ...(initial?.id
              ? { id: initial.id, version: initial.version }
              : {}),
            merchant_id: optional(f, "merchant_id"),
            purchased_on: string(f, "purchased_on"),
            discount_amount: discount,
            paid_amount: paid,
            notes: optional(f, "notes"),
            lines,
          });
          if (demo) {
            s.setMessage("금액 검증 통과 · 데모에서는 저장하지 않습니다.");
            return;
          }
          const result = await request(
            `/api/purchases${initial?.id ? "/" + initial.id : ""}`,
            initial?.id ? "PATCH" : "POST",
            payload,
          );
          let photoFailed = false;
          if (photo && attachPhoto) {
            const upload = new FormData();
            upload.set("kind", "receipt");
            upload.set("target", result.id);
            upload.set("file", photo);
            try {
              await request("/api/media", "POST", upload);
            } catch {
              photoFailed = true;
            }
          }
          let bottleFailed = false;
          for (const [i, line] of lines.entries())
            for (const [j, bottle] of line.wines.entries()) {
              const picked = bottle.bottlePhoto;
              if (!picked) continue;
              try {
                const target = result.targets?.[i]?.[j];
                if (!target) throw Error();
                const upload = new FormData();
                upload.set("kind", "wine");
                upload.set("target", target);
                if ("hit" in picked)
                  upload.set("commons_id", String(picked.hit.id));
                else upload.set("file", picked.file);
                await request("/api/media", "POST", upload);
              } catch {
                bottleFailed = true;
              }
            }
          const params = new URLSearchParams();
          if (photoFailed) params.set("photo", "retry");
          if (bottleFailed) params.set("bottle", "retry");
          s.router.push(
            "/purchases/" + result.id + (params.size ? "?" + params : ""),
          );
        });
      }}
    >
      {!initial && (
        <>
          {demo ? (
            <p className="auth-notice">
              사진 분석은 로그인 후 사용할 수 있습니다. 데모에서는 직접 입력을
              체험하세요.
            </p>
          ) : (
            <PhotoAnalysis
              task="receipt"
              disabled={s.busy}
              onFile={(file) => {
                setPhoto(file);
                setReviewed(false);
              }}
              onBusyChange={setAnalysisBusy}
              onApply={applyAnalysis}
            />
          )}
          {photo && !demo && (
            <label className="filter-check">
              <input
                type="checkbox"
                checked={attachPhoto}
                onChange={(e) => setAttachPhoto(e.target.checked)}
              />
              구매 저장 시 이 사진도 비공개로 첨부
            </label>
          )}
        </>
      )}
      {draft && (
        <div className="auth-notice" role="status">
          <strong>Gemini 초안 · 품목 {draft.lines.length}개</strong>
          <p>
            구매처 표기: {draft.merchant ?? "미확인"}. 원본과 비교해
            와인·수량·세트와 빈 금액을 확인하세요. 세트 가격은 병별로 나누지
            않습니다.
          </p>
          {duplicate && (
            <p>
              같은 날짜와 실결제액의 구매가 이미 있습니다.{" "}
              {!demo && (
                <Link href={"/purchases/" + duplicate.id} className="text-link">
                  기존 영수증 확인
                </Link>
              )}
            </p>
          )}
        </div>
      )}
      <div className="form-grid">
        <Field label="구매일 *">
          <input
            name="purchased_on"
            type="date"
            required
            max={today()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="구매처">
          <select
            name="merchant_id"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
          >
            <option value="">미기재</option>
            {data.merchants.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {lines.map((l, i) => (
        <div className="purchase-line" key={i}>
          <div className="record-row">
            <h3>품목 {i + 1}</h3>
            <Button
              type="button"
              variant="ghost"
              aria-label={`품목 ${i + 1} 삭제`}
              onClick={() => setLines(lines.filter((_, j) => j !== i))}
            >
              <Trash2 size={16} />
            </Button>
          </div>
          <div className="form-grid">
            <Field label="품목 종류">
              <select
                value={l.line_kind}
                onChange={(e) => {
                  const kind = e.target.value as "wine" | "bundle";
                  change(i, {
                    line_kind: kind,
                    wines:
                      kind === "wine"
                        ? l.wines.slice(0, 1)
                        : l.wines.length >= 2
                          ? l.wines
                          : [...l.wines, { ...l.wines[0] }],
                  });
                }}
              >
                <option value="wine">개별 와인</option>
                <option value="bundle">묶음 / 세트</option>
              </select>
            </Field>
            <Field label="줄 전체 금액 (원)">
              <input
                aria-label={`품목 ${i + 1} 금액`}
                type="number"
                min="0"
                step="1"
                required
                value={l.line_amount}
                onChange={(e) =>
                  change(i, {
                    line_amount:
                      e.target.value === "" ? "" : Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="영수증 상품명" wide>
              <input
                value={l.raw_label}
                maxLength={300}
                required
                placeholder="영수증에 적힌 상품명"
                onCompositionStart={() => setComposingLine(i)}
                onCompositionEnd={() => setComposingLine(null)}
                onBlur={() => setComposingLine(null)}
                onChange={(e) =>
                  change(i, {
                    raw_label: e.target.value,
                    labelEdited: true,
                    wines: l.wines.map((x) => ({
                      ...x,
                      bottlePhoto: undefined,
                      catalogOriginal: undefined,
                      analysisDetails: undefined,
                      wine_name: undefined,
                      producer: undefined,
                      description: undefined,
                      name_original: undefined,
                    })),
                  })
                }
              />
            </Field>
          </div>
          {l.wines.map((w, j) => (
            <div key={j}>
              {w.analysisDetails && (
                <ReceiptWineSuggestion
                  details={w.analysisDetails}
                  onChoose={() => {
                    const details = w.analysisDetails!;
                    const name = details.name_ko ?? details.name_en;
                    if (!name) return;
                    const matches = data.wines.filter(
                      (wine) =>
                        wine.name_ko === name ||
                        (details.name_en !== null &&
                          wine.name_original === details.name_en),
                    );
                    change(i, {
                      wines: l.wines.map((bottle, index) =>
                        index === j
                          ? {
                              ...bottle,
                              wine_id:
                                matches.length === 1
                                  ? matches[0].id
                                  : undefined,
                              wine_name: name,
                              description: details.summary_ko ?? undefined,
                              name_original: details.name_en ?? undefined,
                              producer:
                                matches.length === 1
                                  ? (matches[0].producer ?? undefined)
                                  : (details.producer ?? undefined),
                              bottlePhoto: undefined,
                              catalogOriginal: undefined,
                            }
                          : bottle,
                      ),
                    });
                  }}
                />
              )}
              <div className="form-grid">
                <Field label="내 컬렉션 와인 연결">
                  <select
                    value={w.wine_id ?? ""}
                    onChange={(e) => {
                      const chosen = data.wines.find(
                        (v) => v.id === e.target.value,
                      );
                      change(i, {
                        wines: l.wines.map((x, k) =>
                          k === j
                            ? {
                                ...x,
                                wine_id: chosen?.id,
                                wine_name: chosen?.name_ko ?? x.wine_name,
                                producer: chosen?.producer ?? undefined,
                                analysisDetails: undefined,
                                description: undefined,
                                name_original: undefined,
                                bottlePhoto: undefined,
                              }
                            : x,
                        ),
                      });
                    }}
                  >
                    <option value="">신규 와인 / 직접 확인</option>
                    {data.wines.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name_ko}
                        {v.producer ? ` · ${v.producer}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="저장할 와인명">
                  <input
                    required
                    maxLength={200}
                    value={
                      w.wine_name ??
                      data.wines.find((v) => v.id === w.wine_id)?.name_ko ??
                      (l.line_kind === "wine" ? l.raw_label : "")
                    }
                    onChange={(e) =>
                      change(i, {
                        wines: l.wines.map((x, k) =>
                          k === j
                            ? {
                                ...x,
                                wine_id: undefined,
                                wine_name: e.target.value,
                                description: undefined,
                                name_original: undefined,
                                analysisDetails: undefined,
                                producer: undefined,
                                catalogOriginal: undefined,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
              </div>
              <CatalogPicker
                key={l.raw_label}
                label={l.raw_label}
                labelEdited={!!l.labelEdited}
                labelComposing={composingLine === i}
                selected={
                  w.wine_name ??
                  data.wines.find((x) => x.id === w.wine_id)?.name_ko ??
                  null
                }
                onChoose={(c) =>
                  setLines((current) =>
                    current.map((line, index) =>
                      index !== i || line.raw_label !== l.raw_label
                        ? line
                        : {
                            ...line,
                            wines: line.wines.map((x, k) =>
                              k === j
                                ? {
                                    ...x,
                                    wine_id: undefined,
                                    bottlePhoto: undefined,
                                    catalogOriginal: c?.original ?? undefined,
                                    analysisDetails: undefined,
                                    wine_name: c?.name,
                                    description: undefined,
                                    name_original: c?.original ?? undefined,
                                    producer: c?.producer,
                                  }
                                : x,
                            ),
                          },
                    ),
                  )
                }
              />
              <WinePhotoInput
                key={[l.raw_label, w.wine_id, w.wine_name, w.producer].join(
                  "|",
                )}
                name={
                  w.catalogOriginal ||
                  w.wine_name ||
                  data.wines.find((v) => v.id === w.wine_id)?.name_original ||
                  data.wines.find((v) => v.id === w.wine_id)?.name_ko ||
                  l.raw_label
                }
                existingId={
                  data.assets.find((a) => a.wine_id === w.wine_id)?.id
                }
                photo={w.bottlePhoto}
                onChange={(photo) =>
                  setLines((old) =>
                    old.map((line, index) =>
                      index !== i
                        ? line
                        : {
                            ...line,
                            wines: line.wines.map((b, k) =>
                              j === k ? { ...b, bottlePhoto: photo } : b,
                            ),
                          },
                    ),
                  )
                }
              />
              <div className="bottle-input">
                <Field label="병 수">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={w.bottle_quantity}
                    onChange={(e) =>
                      change(i, {
                        wines: l.wines.map((x, k) =>
                          k === j
                            ? {
                                ...x,
                                bottle_quantity:
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value),
                              }
                            : x,
                        ),
                      })
                    }
                  />
                </Field>
                {l.line_kind === "bundle" && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`구성 ${j + 1} 삭제`}
                    onClick={() =>
                      change(i, { wines: l.wines.filter((_, k) => k !== j) })
                    }
                  >
                    <Trash2 size={15} />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {l.line_kind === "bundle" && (
            <>
              <p className="muted">
                세트 총액만 기록합니다. 병별 가격은 미확인으로 유지됩니다.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  change(i, { wines: [...l.wines, defaultLine().wines[0]] })
                }
              >
                세트 구성 추가
              </Button>
            </>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        onClick={() => setLines([...lines, defaultLine()])}
      >
        <Plus size={16} />
        품목 추가
      </Button>
      <div className="form-grid" style={{ marginTop: 24 }}>
        <Field label="영수증 할인 (원)">
          <input
            aria-label="영수증 할인"
            type="number"
            min="0"
            step="1"
            required
            value={discount}
            onChange={(e) =>
              setDiscount(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </Field>
        <Field label="실결제액 (원)">
          <input
            aria-label="실결제액"
            type="number"
            min="0"
            step="1"
            required
            value={paid}
            onChange={(e) =>
              setPaid(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </Field>
        <Field label="메모" wide>
          <textarea
            name="notes"
            maxLength={5000}
            defaultValue={initial?.notes ?? ""}
          />
        </Field>
      </div>
      <div className="money-total" role="status">
        품목 합계 − 할인 = <strong>{won(amountsComplete ? sum : null)}</strong>
        <br />
        실결제액 차이:{" "}
        <strong>{won(amountsComplete ? Number(paid) - sum : null)}</strong>
        {!amountsComplete ? (
          <p>미확인 금액을 입력해야 저장할 수 있습니다.</p>
        ) : (
          paid !== sum && <p>차액을 수정해야 저장할 수 있습니다.</p>
        )}
      </div>
      {draft && (
        <label className="filter-check">
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          원본 영수증과 품목·금액 및 중복 여부를 확인했습니다.
        </label>
      )}
      <div className="form-actions">
        <Button
          disabled={
            s.busy ||
            analysisBusy ||
            !amountsComplete ||
            paid !== sum ||
            !lines.length ||
            (draft !== null && !reviewed)
          }
        >
          {s.busy ? "저장 중…" : demo ? "입력 검증" : "구매 저장"}
        </Button>
        <span className="form-message" role="status">
          {s.message}
        </span>
      </div>
    </form>
  );
}
export function MerchantForm() {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          await request("/api/merchants", "POST", { name: string(f, "name") });
          s.setMessage("구매처를 추가했습니다.");
        });
      }}
    >
      <Field label="구매처 이름">
        <input name="name" required maxLength={200} />
      </Field>
      <div className="form-actions">
        <Button variant="outline" disabled={s.busy}>
          구매처 추가
        </Button>
        <span role="status">{s.message}</span>
      </div>
    </form>
  );
}
export function MediaForm({
  kind,
  target,
  assets,
}: {
  kind: "wine" | "receipt";
  target: string;
  assets: Asset[];
}) {
  const s = useSave();
  return (
    <>
      <div className="image-gallery">
        {assets.map((a) => (
          <div key={a.id}>
            <a
              href={`/api/media/${a.id}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={`/api/media/${a.id}`}
                alt={kind === "wine" ? "내 와인 사진" : "비공개 영수증 이미지"}
              />
            </a>
            {a.photo_credit && (
              <small>
                <a
                  className="text-link"
                  href={a.photo_credit.page}
                  rel="noreferrer"
                  target="_blank"
                >
                  {a.photo_credit.title}
                </a>{" "}
                · {a.photo_credit.author} ·{" "}
                <a
                  href={a.photo_credit.licenseUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {a.photo_credit.license}
                </a>{" "}
                · 크기 조정·WebP 변환
              </small>
            )}
            <DeletePhoto id={a.id} kind={kind} />
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          f.set("kind", kind);
          f.set("target", target);
          s.save(async () => {
            const file = f.get("file");
            if (!(file instanceof File))
              throw new Error("사진을 선택해 주세요.");
            f.set("file", await prepareUpload(file));
            await request("/api/media", "POST", f);
            s.setMessage("사진을 저장했습니다.");
          });
        }}
      >
        <Field label="이미지 첨부 · JPEG/PNG/WebP, 10MB 이하">
          <input
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            required
          />
        </Field>
        <div className="form-actions">
          <Button variant="outline" disabled={s.busy}>
            {s.busy ? "이미지 처리 중…" : "비공개 업로드"}
          </Button>
          <span className="form-message" role="status">
            {s.message}
          </span>
        </div>
      </form>
    </>
  );
}
export function Logout() {
  const s = useSave();
  return (
    <>
      <Button
        variant="outline"
        disabled={s.busy}
        onClick={() =>
          s.save(async () => {
            await request(
              "/api/auth/logout",
              "POST",
            ); /* A full navigation clears cached private RSC payloads after logout. */
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/login");
          })
        }
      >
        로그아웃
      </Button>
      <p role="status">{s.message}</p>
    </>
  );
}
export function InviteForm() {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          await request("/api/admin/invite", "POST", {
            email: string(f, "email"),
          });
          s.setMessage("초대 메일을 발송했습니다.");
        });
      }}
    >
      <Field label="초대할 이메일 (재발송 시 같은 이메일 입력)">
        <input name="email" type="email" required />
      </Field>
      <div className="form-actions">
        <Button disabled={s.busy}>초대 / 재발송</Button>
        <span role="status" className="form-message">
          {s.message}
        </span>
      </div>
    </form>
  );
}
export function UserControl({
  id,
  status,
  role,
}: {
  id: string;
  status: string;
  role: string;
}) {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (!confirm("이 계정의 상태/역할을 변경할까요?")) return;
        s.save(async () => {
          const result = await request("/api/admin/users/" + id, "PATCH", {
            status: string(f, "status"),
            role: string(f, "role"),
          });
          s.setMessage(result.warning ?? "계정 설정을 변경했습니다.");
        });
      }}
    >
      <div className="form-actions">
        <select
          aria-label="계정 상태"
          name="status"
          defaultValue={status === "invited" ? "disabled" : status}
        >
          <option value="active">활성</option>
          <option value="disabled">비활성</option>
        </select>
        <select aria-label="계정 역할" name="role" defaultValue={role}>
          <option value="member">일반 사용자</option>
          <option value="admin">관리자</option>
        </select>
        <Button variant="outline" disabled={s.busy || status === "invited"}>
          변경
        </Button>
      </div>
      <p className="form-message" role="status">
        {s.message}
      </p>
    </form>
  );
}
