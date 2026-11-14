"use client";
import { useEffect, useRef, useState } from "react";
import type { Worker as OcrWorker } from "tesseract.js";
import { prepareUpload } from "@/lib/image-client";
import { Button } from "./ui/button";

export function ReceiptPhoto({
  onText,
  onFile,
  disabled = false,
}: {
  onText: (text: string) => void;
  onFile: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState(""),
    [preview, setPreview] = useState(""),
    [busy, setBusy] = useState(false);
  const job = useRef<AbortController | null>(null);
  const url = useRef("");
  useEffect(
    () => () => {
      job.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  function clear() {
    job.current?.abort();
    job.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = "";
    setPreview("");
    onFile(null);
    setBusy(false);
    setStatus("");
  }
  async function read(file: File) {
    clear();
    onText("");
    const c = new AbortController();
    job.current = c;
    setBusy(true);
    setStatus("영수증 사진을 확인하는 중…");
    let worker: OcrWorker | null = null;
    const stop = () => {
      if (worker) {
        void worker.terminate();
        worker = null;
      }
    };
    c.signal.addEventListener("abort", stop, { once: true });
    const timeout = window.setTimeout(() => {
      c.abort();
      setBusy(false);
      setStatus(
        "인식 시간이 길어졌습니다. 사진을 다시 선택하거나 텍스트를 입력하세요.",
      );
    }, 120000);
    try {
      const image = await prepareUpload(file);
      if (c.signal.aborted) return;
      url.current = URL.createObjectURL(image);
      setPreview(url.current);
      onFile(image);
      setStatus("한국어·영어 인식 도구를 준비하는 중…");
      const { createWorker, OEM, PSM } = await import("tesseract.js");
      if (c.signal.aborted) return;
      const base = new URL("/receipt-ocr/", window.location.origin).href;
      const fail = () => {
        if (!c.signal.aborted) {
          c.abort();
          setBusy(false);
          setStatus(
            "사진을 읽지 못했습니다. 다시 촬영하거나 텍스트를 입력하세요.",
          );
        }
      };
      worker = await createWorker(["kor", "eng"], OEM.LSTM_ONLY, {
        workerPath: base + "worker.min.js",
        corePath: base,
        langPath: base,
        workerBlobURL: false,
        errorHandler: fail,
        logger: (m) => {
          if (!c.signal.aborted && m.status === "recognizing text")
            setStatus(
              `사진에서 글자를 읽는 중… ${Math.round(m.progress * 100)}%`,
            );
        },
      });
      if (c.signal.aborted) return;
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      const {
        data: { text },
      } = await worker.recognize(image);
      if (c.signal.aborted) return;
      if (!text.trim())
        throw new Error(
          "인식된 글자가 없습니다. 영수증이 밝고 선명하게 보이도록 다시 찍어 주세요.",
        );
      if (text.trim().length > 30000)
        throw new Error("글자가 너무 많습니다. 영수증 한 장씩 선택해 주세요.");
      onText(text.trim());
      setStatus("사진을 읽었습니다. 아래 텍스트를 확인한 뒤 초안을 채우세요.");
    } catch (err) {
      if (!c.signal.aborted)
        setStatus(
          err instanceof Error && /[가-힣]/.test(err.message)
            ? err.message
            : "사진을 읽지 못했습니다. JPEG·PNG·WebP 사진으로 다시 시도하세요.",
        );
    } finally {
      clearTimeout(timeout);
      stop();
      c.signal.removeEventListener("abort", stop);
      if (job.current === c) setBusy(false);
    }
  }
  const accept = "image/jpeg,image/png,image/webp";
  const gallery = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null);
  return (
    <section className="purchase-line" aria-label="영수증 사진 입력">
      <h3>영수증 사진으로 입력</h3>
      <p>사진 한 장의 글자를 이 기기에서 읽습니다. JPEG·PNG·WebP, 최대 10MB.</p>
      <div className="form-actions">
        {(
          [
            [gallery, false, "사진 선택"],
            [camera, true, "카메라 촬영"],
          ] as const
        ).map(([input, capture, title]) => (
          <span key={title}>
            <input
              ref={input}
              hidden
              type="file"
              aria-label={title}
              accept={accept}
              capture={capture ? "environment" : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void read(file);
              }}
            />
            <Button
              variant="outline"
              type="button"
              disabled={disabled}
              onClick={() => input.current?.click()}
            >
              {title}
            </Button>
          </span>
        ))}
        {(preview || busy) && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              clear();
              onText("");
            }}
          >
            사진 제거
          </Button>
        )}
      </div>
      {preview && (
        <a href={preview} target="_blank" rel="noreferrer">
          {/* This is a private, local object URL, not a network image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="선택한 영수증 미리보기"
            style={{
              maxHeight: 180,
              maxWidth: "100%",
              marginBlock: 12,
              objectFit: "contain",
            }}
          />
        </a>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
