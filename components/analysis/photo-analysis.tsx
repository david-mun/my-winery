"use client";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { prepareUpload } from "@/lib/image-client";
import {
  wineDisplayName,
  receiptAnalysisSchema,
  wineAnalysisSchema,
  winePhotoAnalysisSchema,
  type AnalysisResult,
  type AnalysisTask,
} from "@/lib/analysis/contracts";
import { Button } from "@/components/ui/button";
import { collectionMatchesSchema } from "@/lib/analysis/collection-matching";

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
type Rect = { x: number; y: number; width: number; height: number };
export function PhotoAnalysis({
  task,
  onApply,
  onFile,
  onBusyChange,
  disabled = false,
}: {
  task: AnalysisTask;
  onApply: (result: AnalysisResult) => void;
  onFile?: (file: File | null) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<"redact" | "crop">(
    task === "receipt" ? "redact" : "crop",
  );
  const [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [area, setArea] = useState({ x: 0, y: 0, width: 100, height: 100 });
  useEffect(() => {
    onBusyChange?.(busy || editing);
    return () => onBusyChange?.(false);
  }, [busy, editing, onBusyChange]);
  const [selection, setSelection] = useState<Rect | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    original = useRef<File | null>(null);
  const job = useRef<AbortController | null>(null),
    revision = useRef(0),
    start = useRef<{ x: number; y: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  useEffect(
    () => () => {
      job.current?.abort();
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    if (file)
      void createImageBitmap(file).then((bitmap) => {
        if (!cancelled && canvas.current) {
          canvas.current.width = bitmap.width;
          canvas.current.height = bitmap.height;
          canvas.current.getContext("2d")?.drawImage(bitmap, 0, 0);
          setDimensions({ width: bitmap.width, height: bitmap.height });
        }
        bitmap.close();
      });
    return () => {
      cancelled = true;
    };
  }, [file]);
  function replace(next: File | null) {
    revision.current++;
    job.current?.abort();
    job.current = null;
    setBusy(false);
    setConsent(false);
    setSelection(null);
    setResult(null);
    setMessage("");
    setFile(next);
    onFile?.(next);
  }
  async function choose(source: File) {
    replace(null);
    const version = revision.current;
    try {
      const prepared = await prepareUpload(source);
      if (revision.current !== version) return;
      original.current = prepared;
      replace(prepared);
    } catch (error) {
      if (revision.current === version)
        setMessage(
          error instanceof Error ? error.message : "사진을 읽지 못했습니다.",
        );
    }
  }
  async function edit(rect: Rect, action: "redact" | "crop") {
    const current = file;
    if (!current || editing || rect.width < 4 || rect.height < 4) return;
    const version = ++revision.current;
    job.current?.abort();
    setBusy(false);
    setConsent(false);
    setResult(null);
    setEditing(true);
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(current);
      const out = document.createElement("canvas");
      out.width = action === "crop" ? rect.width : bitmap.width;
      out.height = action === "crop" ? rect.height : bitmap.height;
      const context = out.getContext("2d");
      if (!context) return;
      if (action === "crop")
        context.drawImage(
          bitmap,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          0,
          0,
          rect.width,
          rect.height,
        );
      else {
        context.drawImage(bitmap, 0, 0);
        context.fillStyle = "white";
        context.fillRect(rect.x, rect.y, rect.width, rect.height);
      }
      const encode = (type: string) =>
        new Promise<Blob | null>((resolve) => out.toBlob(resolve, type, 0.9));
      let blob = await encode("image/webp");
      if (!blob || blob.type !== "image/webp")
        blob = await encode("image/jpeg");
      if (!blob || !["image/webp", "image/jpeg"].includes(blob.type))
        throw new Error("IMAGE_ENCODE");
      const edited = await prepareUpload(
        new File(
          [blob],
          blob.type === "image/webp" ? "analysis.webp" : "analysis.jpg",
          { type: blob.type },
        ),
      );
      if (revision.current === version) replace(edited);
    } catch {
      if (revision.current === version)
        setMessage("사진을 편집하지 못했습니다. 다시 선택해 주세요.");
    } finally {
      bitmap?.close();
      setEditing(false);
    }
  }
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const c = event.currentTarget,
      r = c.getBoundingClientRect();
    return {
      x: Math.round(
        Math.max(
          0,
          Math.min(c.width, ((event.clientX - r.left) * c.width) / r.width),
        ),
      ),
      y: Math.round(
        Math.max(
          0,
          Math.min(c.height, ((event.clientY - r.top) * c.height) / r.height),
        ),
      ),
    };
  }
  async function analyze() {
    if (!file || !consent || editing) return;
    const controller = new AbortController();
    job.current = controller;
    const version = revision.current;
    setBusy(true);
    setMessage("사진을 분석하는 중…");
    setResult(null);
    const timer = window.setTimeout(() => controller.abort(), 55000);
    try {
      if (file.size > 3 * 1024 * 1024)
        throw new Error("사진 크기를 3MB 이하로 줄여 주세요.");
      const data = new FormData();
      data.set("file", file);
      data.set("consent", "true");
      const res = await fetch(`/api/analysis/${task}`, {
        method: "POST",
        body: data,
        signal: controller.signal,
      });
      const body = await res.json();
      if (!res.ok)
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "사진을 분석하지 못했습니다.",
        );
      if (body.task !== task) throw new Error("분석 결과가 요청과 다릅니다.");
      const parsed =
        task === "receipt"
          ? ({
              task,
              analysis: receiptAnalysisSchema.parse(body.analysis),
            } as const)
          : task === "wine-photo"
            ? ({
                task,
                analysis: winePhotoAnalysisSchema.parse(body.analysis),
              } as const)
            : ({
                task,
                analysis: wineAnalysisSchema.parse(body.analysis),
              } as const);
      if (revision.current !== version || controller.signal.aborted) return;
      setResult({
        ...parsed,
        collection_matches: collectionMatchesSchema.parse(
          body.collection_matches ?? [],
        ),
        warnings: Array.isArray(body.warnings)
          ? body.warnings.filter((x: unknown) => typeof x === "string")
          : [],
      });
      setMessage("분석했습니다. 원본과 비교한 뒤 초안에 적용하세요.");
    } catch (error) {
      if (revision.current === version)
        setMessage(
          controller.signal.aborted
            ? "분석이 취소되었거나 시간이 초과되었습니다. 다시 시도하거나 직접 입력해 주세요."
            : error instanceof Error
              ? error.message
              : "분석하지 못했습니다. 직접 입력해 주세요.",
        );
    } finally {
      clearTimeout(timer);
      if (revision.current === version) {
        setBusy(false);
        job.current = null;
      }
    }
  }
  const label =
    task === "receipt"
      ? "영수증"
      : task === "wine-photo"
        ? "와인"
        : "와인 라벨";
  return (
    <section
      className="purchase-line photo-analysis"
      aria-label={`${label} 사진 분석`}
    >
      <h3>{label} 사진으로 입력</h3>
      <p>
        JPEG·PNG·WebP, 선택 파일 10MB 이하.{" "}
        {task === "wine-label"
          ? "한 병의 라벨만 보이도록 잘라 주세요."
          : task === "wine-photo"
            ? "한 병 또는 여러 병의 라벨이 잘 보이는 사진을 선택하세요. 최대 20병까지 분석합니다."
            : "연락처·카드·전표번호 등 개인정보를 가려 주세요."}
      </p>
      <div className="form-actions">
        <label className="text-link">
          사진 선택
          <input
            type="file"
            aria-label={`${label} 사진 선택`}
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || !ready || editing}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) void choose(picked);
            }}
          />
        </label>
        <label className="text-link">
          카메라 촬영
          <input
            type="file"
            aria-label={`${label} 카메라 촬영`}
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={disabled || !ready || editing}
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (picked) void choose(picked);
            }}
          />
        </label>
        {file && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || !ready || editing}
            onClick={() => {
              original.current = null;
              replace(null);
            }}
          >
            사진 제거
          </Button>
        )}
      </div>
      {file && (
        <>
          <div className="form-actions">
            <Button
              type="button"
              disabled={disabled || !ready || editing}
              variant="outline"
              aria-pressed={mode === "redact"}
              onClick={() => setMode("redact")}
            >
              정보 가리기
            </Button>
            <Button
              type="button"
              disabled={disabled || !ready || editing}
              variant="outline"
              aria-pressed={mode === "crop"}
              onClick={() => setMode("crop")}
            >
              한 병 / 영역 자르기
            </Button>
            <Button
              type="button"
              disabled={disabled || !ready || editing}
              variant="ghost"
              onClick={() => replace(original.current)}
            >
              원본으로 되돌리기
            </Button>
          </div>
          <p>
            미리보기에서 드래그하면 선택 영역을{" "}
            {mode === "redact" ? "가립니다" : "잘라 사용합니다"}. 가리기는 아래
            버튼으로도 가능합니다.
          </p>
          <div className="analysis-preview">
            <canvas
              ref={canvas}
              role="img"
              aria-label={`전송할 ${label} 미리보기`}
              onPointerDown={(e) => {
                if (disabled || editing) return;
                start.current = point(e);
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (!start.current) return;
                const p = point(e),
                  s = start.current;
                setSelection({
                  x: Math.min(s.x, p.x),
                  y: Math.min(s.y, p.y),
                  width: Math.abs(p.x - s.x),
                  height: Math.abs(p.y - s.y),
                });
              }}
              onPointerUp={(e) => {
                if (!start.current) return;
                const p = point(e),
                  s = start.current;
                start.current = null;
                setSelection(null);
                void edit(
                  {
                    x: Math.min(s.x, p.x),
                    y: Math.min(s.y, p.y),
                    width: Math.abs(p.x - s.x),
                    height: Math.abs(p.y - s.y),
                  },
                  mode,
                );
              }}
              onPointerCancel={() => {
                start.current = null;
                setSelection(null);
              }}
            />
            {selection && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  pointerEvents: "none",
                  border: "2px solid #8c233a",
                  left: `${(selection.x / dimensions.width) * 100}%`,
                  top: `${(selection.y / dimensions.height) * 100}%`,
                  width: `${(selection.width / dimensions.width) * 100}%`,
                  height: `${(selection.height / dimensions.height) * 100}%`,
                }}
              />
            )}
          </div>
          <div className="form-actions">
            <Button
              type="button"
              disabled={disabled || !ready || editing}
              variant="outline"
              onClick={() => {
                const c = canvas.current;
                if (c)
                  void edit(
                    {
                      x: 0,
                      y: 0,
                      width: c.width,
                      height: Math.round(c.height * 0.28),
                    },
                    "redact",
                  );
              }}
            >
              상단 가리기
            </Button>
            <Button
              type="button"
              disabled={disabled || !ready || editing}
              variant="outline"
              onClick={() => {
                const c = canvas.current;
                if (c) {
                  const h = Math.round(c.height * 0.22);
                  void edit(
                    { x: 0, y: c.height - h, width: c.width, height: h },
                    "redact",
                  );
                }
              }}
            >
              하단 가리기
            </Button>
          </div>
          <p>
            {task === "wine-label"
              ? "선택한 이미지를"
              : "선택한 이미지와 내 컬렉션의 전체 와인 이름·생산자·종류·산지·품종 목록을"}{" "}
            Google Gemini로 전송합니다. 무료 서비스에서는 입력·응답이 제품
            개선에 사용될 수 있으므로 개인정보·민감정보를 보내지 마세요.
          </p>
          <label className="filter-check">
            <input
              type="checkbox"
              checked={consent}
              disabled={editing}
              onChange={(e) => setConsent(e.target.checked)}
            />
            전송할 사진을 확인했고 개인정보를 가렸습니다.
          </label>
          <div className="form-actions">
            <Button
              type="button"
              disabled={disabled || busy || editing || !consent}
              onClick={() => void analyze()}
            >
              {busy ? "분석 중…" : "Gemini로 분석"}
            </Button>
            {busy && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  revision.current++;
                  job.current?.abort();
                  setBusy(false);
                  setMessage("분석을 취소했습니다.");
                }}
              >
                분석 취소
              </Button>
            )}
          </div>
        </>
      )}
      {file && (
        <details>
          <summary className="text-link">키보드로 영역 지정</summary>
          <div className="form-grid">
            {(
              [
                ["x", "왼쪽 (%)"],
                ["y", "위 (%)"],
                ["width", "가로 (%)"],
                ["height", "세로 (%)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={area[key]}
                  disabled={editing || disabled}
                  onChange={(e) =>
                    setArea({ ...area, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={editing || disabled}
            onClick={() => {
              if (
                area.x + area.width > 100 ||
                area.y + area.height > 100 ||
                area.width <= 0 ||
                area.height <= 0
              ) {
                setMessage("사진 안의 영역을 지정해 주세요.");
                return;
              }
              void edit(
                {
                  x: Math.round((dimensions.width * area.x) / 100),
                  y: Math.round((dimensions.height * area.y) / 100),
                  width: Math.floor((dimensions.width * area.width) / 100),
                  height: Math.floor((dimensions.height * area.height) / 100),
                },
                mode,
              );
            }}
          >
            지정한 영역 적용
          </Button>
        </details>
      )}
      <p role="status">{editing ? "사진을 편집하는 중…" : message}</p>
      {result && (
        <div className="auth-notice">
          <strong>
            {result.task === "receipt"
              ? `구매 초안 · 상품 ${result.analysis.lines.length}줄`
              : result.task === "wine-photo"
                ? `구매 초안 · 와인 ${result.analysis.bottle_count}병`
                : result.analysis.wine
                  ? wineDisplayName(result.analysis.wine)
                  : ""}
          </strong>
          {result.task === "wine-photo" && (
            <>
              <ol>
                {result.analysis.bottles.map((b) => (
                  <li key={b.position_left_to_right}>
                    {b.observed.wine
                      ? wineDisplayName(b.observed.wine)
                      : "미확인"}
                    {b.product_candidate?.name_ko &&
                      ` · 후보: ${b.product_candidate.name_ko}`}
                  </li>
                ))}
              </ol>
              <p>
                구매일·구매처·가격은 직접 입력해 주세요. 사진 속 병 수와 실제
                구매 수량도 확인하세요.
              </p>
            </>
          )}
          {result.task === "wine-label" && (
            <p>
              도수: {result.analysis.wine?.alcohol_percent ?? "미확인"} · 용량:{" "}
              {result.analysis.wine?.bottle_volume_ml ?? "미확인"}
            </p>
          )}
          {result.warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={disabled || busy}
            onClick={() => {
              onApply(result);
              setResult(null);
            }}
          >
            초안에 적용
          </Button>
        </div>
      )}
    </section>
  );
}
