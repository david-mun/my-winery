"use client";
/* Private signed images deliberately bypass the shared Next image optimizer. */
/* eslint-disable @next/next/no-img-element */
import { parseReceiptText, type OcrDraft } from "@/lib/receipt-ocr";
import { WinePhotoInput, type BottlePhoto } from "./wine-photo-input";
import { DeletePhoto } from "./delete-photo";
import { ReceiptPhoto } from "./receipt-photo";
import { CatalogPicker } from "./catalog-picker";
import { prepareUpload } from "@/lib/image-client";
import {
  useState,
  useRef,
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
export function WineForm({ wine }: { wine?: Wine }) {
  const s = useSave();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        s.save(async () => {
          const value = {
            name_ko: string(f, "name_ko"),
            wine_type: string(f, "wine_type"),
            name_original: optional(f, "name_original"),
            producer: optional(f, "producer"),
            country: optional(f, "country"),
            region: optional(f, "region"),
            grape: optional(f, "grape"),
            description: optional(f, "description"),
          };
          const result = await request(
            `/api/wines${wine ? "/" + wine.id : ""}`,
            wine ? "PATCH" : "POST",
            value,
          );
          s.router.push("/wines/" + result.id);
        });
      }}
    >
      <div className="form-grid">
        <Field label="와인 이름 *">
          <input
            name="name_ko"
            required
            maxLength={200}
            defaultValue={wine?.name_ko}
          />
        </Field>
        <Field label="종류">
          <select name="wine_type" defaultValue={wine?.wine_type ?? "white"}>
            {Object.entries(wineTypes).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {[
          ["name_original", "원어 이름"],
          ["producer", "생산자"],
          ["country", "국가"],
          ["region", "지역"],
          ["grape", "품종"],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              name={key}
              maxLength={200}
              defaultValue={(wine?.[key as keyof Wine] as string) ?? ""}
            />
          </Field>
        ))}
        <Field label="메모" wide>
          <textarea
            name="description"
            maxLength={5000}
            defaultValue={wine?.description ?? ""}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Button disabled={s.busy}>{s.busy ? "저장 중…" : "와인 저장"}</Button>
        <span role="status" className="form-message">
          {s.message}
        </span>
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
              vintage_label: string(f, "vintage_label") || "UNKNOWN",
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
        <Field label="빈티지">
          <input
            name="vintage_label"
            pattern="NV|UNKNOWN|[12][0-9]{3}"
            defaultValue={note?.vintage_label ?? "UNKNOWN"}
            placeholder="2025 / NV / UNKNOWN"
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
            rating_scope: string(f, "rating_scope"),
            vintage_label: string(f, "vintage_label"),
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
        <Field label="평점 범위">
          <select name="rating_scope">
            <option value="ALL_VINTAGES">전체 빈티지</option>
            <option value="VINTAGE">특정 연도</option>
            <option value="NV">NV</option>
            <option value="UNKNOWN">미확인</option>
          </select>
        </Field>
        <Field label="평점 대상 빈티지">
          <input
            name="vintage_label"
            defaultValue="UNKNOWN"
            required
            pattern="NV|UNKNOWN|[12][0-9]{3}"
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
  const [ocrText, setOcrText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [attachPhoto, setAttachPhoto] = useState(true);
  const ocrPanel = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState<OcrDraft | null>(null);
  const [ocrError, setOcrError] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [composingLine, setComposingLine] = useState<number | null>(null);
  function applyOcr() {
    try {
      const result = parseReceiptText(ocrText);
      setLines(
        result.items.map((item) => ({
          line_kind: "wine",
          raw_label: item.label,
          line_amount: item.amount ?? "",
          wines: [
            {
              wine_id: undefined,
              vintage_label: "UNKNOWN",
              bottle_quantity: item.quantity ?? "",
            },
          ],
        })),
      );
      setDate(result.date ?? "");
      setPaid(result.paid ?? "");
      setDiscount(result.discount ?? "");
      setMerchant(
        data.merchants.find((m) => m.name === result.merchant)?.id ?? "",
      );
      setDraft(result);
      setReviewed(false);
      setOcrText("");
      setOcrError("");
      s.setMessage("");
    } catch (err) {
      setOcrError(
        err instanceof Error ? err.message : "인식 결과를 읽지 못했습니다.",
      );
    }
  }
  const duplicate =
    draft &&
    data.receipts.find(
      (r) => r.purchased_on === date && r.paid_amount === paid,
    );
  const change = (i: number, update: Partial<EditorLine>) =>
    setLines((old) => old.map((l, k) => (k === i ? { ...l, ...update } : l)));
  const sum =
    lines.reduce((s, l) => s + Number(l.line_amount), 0) - Number(discount);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (draft && (!reviewed || discount === "")) return;
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
          <ReceiptPhoto
            disabled={s.busy}
            onFile={setPhoto}
            onText={(text) => {
              setOcrText(text);
              setOcrError("");
              if (text && ocrPanel.current) ocrPanel.current.open = true;
            }}
          />
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
          <details ref={ocrPanel} className="purchase-line">
            <summary className="text-link">OCR 텍스트로 구매 내역 입력</summary>
            <p>
              영수증에서 복사한 텍스트를 붙여넣으세요. 초안을 만들면 아래의
              날짜·금액·품목 입력을 교체합니다. 원문은 브라우저에서만 읽습니다.
            </p>
            <Field label="영수증 OCR 텍스트" wide>
              <textarea
                maxLength={30000}
                value={ocrText}
                onChange={(e) => setOcrText(e.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="outline"
              disabled={!ocrText.trim()}
              onClick={applyOcr}
            >
              초안 채우기
            </Button>
            {ocrError && <p role="alert">{ocrError}</p>}
          </details>
        </>
      )}
      {draft && (
        <div className="auth-notice" role="status">
          <strong>OCR 초안 · 품목 {draft.items.length}개</strong>
          <p>
            구매처 표기: {draft.merchant ?? "미확인"}. 원본과 비교해
            와인·수량·빈티지와 빈 금액을 확인하세요. 세트는 묶음으로 바꾸고 구성
            와인을 선택하세요.
          </p>
          {draft.loosePrices.length > 0 && (
            <p>
              품목 연결을 확인할 금액: {draft.loosePrices.map(won).join(", ")}
            </p>
          )}
          {draft.discount === null && (
            <p>
              할인 합계를 자동 확인하지 못했습니다. 원본에서 확인해 입력하세요.
            </p>
          )}
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
                      wine_name: undefined,
                      producer: undefined,
                    })),
                  })
                }
              />
            </Field>
          </div>
          {l.wines.map((w, j) => (
            <div key={j}>
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
                                    wine_name: c?.name,
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
                <Field label="빈티지">
                  <input
                    value={w.vintage_label}
                    required
                    pattern="NV|UNKNOWN|[12][0-9]{3}"
                    onChange={(e) =>
                      change(i, {
                        wines: l.wines.map((x, k) =>
                          k === j ? { ...x, vintage_label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                </Field>
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
        품목 합계 − 할인 = <strong>{won(sum)}</strong>
        <br />
        실결제액 차이: <strong>{won(paid === "" ? null : paid - sum)}</strong>
        {paid !== sum && <p>차액을 수정해야 저장할 수 있습니다.</p>}
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
