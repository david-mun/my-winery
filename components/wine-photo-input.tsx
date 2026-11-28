"use client";
/* Private previews are local object URLs; external thumbnails use no referrer. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, useRef } from "react";
import { DeletePhoto } from "./delete-photo";
import { Button } from "./ui/button";
import { commonsPhotos, type WinePhotoHit } from "@/lib/wine-photo-catalog";
import { prepareUpload } from "@/lib/image-client";
export type BottlePhoto =
  { file: File; analysisSource?: File } | { hit: WinePhotoHit };
export function WinePhotoInput({
  name,
  existingId,
  photo,
  onChange,
}: {
  name: string;
  existingId?: string;
  photo?: BottlePhoto;
  onChange: (p?: BottlePhoto) => void;
}) {
  const [hits, setHits] = useState<WinePhotoHit[]>([]),
    [status, setStatus] = useState("");
  const localPreview = useRef<HTMLImageElement>(null);
  const [busy, setBusy] = useState(false);
  const current = useRef(0),
    active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      current.current++;
      active.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (!photo || !("file" in photo)) return;
    const url = URL.createObjectURL(photo.file);
    if (localPreview.current) localPreview.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  async function search() {
    active.current?.abort();
    const c = new AbortController();
    active.current = c;
    const version = ++current.current;
    setBusy(true);
    setStatus("사진을 찾는 중…");
    setHits([]);
    try {
      const result = await commonsPhotos(
        { q: name },
        AbortSignal.any([c.signal, AbortSignal.timeout(15000)]),
      );
      if (version !== current.current) return;
      setHits(result);
      setStatus(
        result.length
          ? "병과 라벨을 확인하고 한 장을 선택하세요."
          : "사용 가능한 공개 사진이 없습니다. 직접 찍은 사진을 첨부할 수 있습니다.",
      );
    } catch {
      if (version === current.current)
        setStatus(
          "사진 검색에 연결하지 못했습니다. 직접 찍은 사진을 사용할 수 있습니다.",
        );
    } finally {
      if (version === current.current) setBusy(false);
    }
  }
  async function pick(file: File) {
    active.current?.abort();
    const version = ++current.current;
    setBusy(true);
    setStatus("사진을 확인하는 중…");
    try {
      const prepared = await prepareUpload(file);
      if (version === current.current) {
        onChange({ file: prepared });
        setHits([]);
        setStatus("구매를 저장할 때 병 사진도 첨부합니다.");
      }
    } catch {
      if (version === current.current)
        setStatus("JPEG·PNG·WebP, 10MB·40MP 이하의 사진을 선택하세요.");
    } finally {
      if (version === current.current) setBusy(false);
    }
  }
  const src = photo
    ? "hit" in photo
      ? photo.hit.url
      : ""
    : existingId
      ? "/api/media/" + existingId
      : "";
  const automatic = photo && "file" in photo && photo.analysisSource;
  const preview = photo && "file" in photo && (
    <img
      ref={localPreview}
      alt="와인 병 사진 미리보기"
      style={{
        display: "block",
        maxHeight: 140,
        maxWidth: "100%",
        objectFit: "contain",
      }}
    />
  );
  return (
    <details className="purchase-line">
      <summary className="text-link">
        와인 병 사진{" "}
        {automatic
          ? "· 분석 사진 첨부 예정"
          : photo
            ? "· 첨부 예정"
            : existingId
              ? "· 등록됨"
              : "· 선택 사항"}
        {automatic && preview}
      </summary>
      {!automatic && preview}
      {src && (
        <img
          alt="와인 병 사진 미리보기"
          src={src}
          referrerPolicy="no-referrer"
          style={{ maxHeight: 140, maxWidth: "100%", objectFit: "contain" }}
        />
      )}
      {!photo && existingId && (
        <DeletePhoto key={existingId} id={existingId} kind="wine" />
      )}
      <p>
        공개 사진은 와인명으로 검색합니다. 검색 결과의 상품과 라벨은 실제 병과
        다를 수 있습니다.
      </p>
      <Button
        type="button"
        variant="outline"
        disabled={busy || name.trim().length < 2}
        onClick={search}
      >
        공개 병 사진 찾기
      </Button>
      <div className="form-grid">
        {[false, true].map((camera) => (
          <label className="field" key={String(camera)}>
            {camera ? "병 사진 촬영" : "내 병 사진 선택"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture={camera ? "environment" : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void pick(file);
              }}
            />
          </label>
        ))}
      </div>
      <p role="status">{status}</p>
      {hits.map((hit) => (
        <div key={hit.id} className="record-row">
          <img
            src={hit.url}
            referrerPolicy="no-referrer"
            alt={hit.title}
            loading="lazy"
            width={72}
          />
          <span>
            <a href={hit.page} target="_blank" rel="noreferrer">
              {hit.title}
            </a>{" "}
            · {hit.author} ·{" "}
            <a href={hit.licenseUrl} target="_blank" rel="noreferrer">
              {hit.license}
            </a>
          </span>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onChange({ hit });
              setHits([]);
              setStatus("선택한 사진을 구매 저장 시 추가합니다.");
            }}
          >
            이 사진 선택
          </Button>
        </div>
      ))}
      {photo && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            onChange();
            setStatus("");
          }}
        >
          첨부 취소
        </Button>
      )}
    </details>
  );
}
