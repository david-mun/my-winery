"use client";
import { useState, useEffect, useEffectEvent } from "react";
import type { CatalogWine, CatalogResult } from "@/lib/wine-catalog";
import { Button } from "./ui/button";
// Keep OCR batches below the proxy’s concurrent-request limit. Cancelled jobs
// check their signal before starting, even if they were waiting for a slot.
const queue: (() => Promise<void>)[] = [];
let running = 0;
function runNext() {
  const job = queue.shift();
  if (!job) return;
  running++;
  void job().finally(() => {
    running--;
    runNext();
  });
}
function enqueue(job: () => Promise<void>) {
  queue.push(job);
  if (running < 2) runNext();
}

export function CatalogPicker({
  label,
  labelEdited,
  labelComposing,
  selected,
  onChoose,
}: {
  label: string;
  labelEdited: boolean;
  labelComposing: boolean;
  selected: string | null;
  onChoose: (wine: CatalogWine | null) => void;
}) {
  const [query, setQuery] = useState(label),
    [result, setResult] = useState<CatalogResult | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  // Opening an already-linked receipt must not send its historical rows or
  // replace a choice. Editing the search field explicitly enables it again.
  const [enabled, setEnabled] = useState(!selected || labelEdited);
  const [composing, setComposing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const term = query.trim();

  const receive = useEffectEvent((found: CatalogResult) => {
    setResult(found);
    const exact = found.candidates.find((w) => w.id === found.exactId);
    if (exact && !selected) {
      onChoose(exact);
      setMessage("이름이 일치하는 와인을 연결했습니다.");
    } else {
      setMessage(
        found.candidates.length
          ? "맞는 와인이 있으면 선택하세요."
          : "검색 결과가 없습니다. 상품명 일부나 영문명으로 다시 검색해 보세요.",
      );
    }
  });
  useEffect(() => {
    if (!enabled || composing || labelComposing || term.length < 2) return;
    const controller = new AbortController();
    const { signal } = controller;
    const timer = window.setTimeout(() => {
      setBusy(true);
      enqueue(async () => {
        if (signal.aborted) return;
        try {
          const response = await fetch("/api/wine-search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: term }),
            signal,
          });
          if (!response.ok) throw new Error("catalog unavailable");
          const found: CatalogResult = await response.json();
          if (!signal.aborted) receive(found);
        } catch {
          if (!signal.aborted) {
            setFailed(true);
            setMessage(
              "지금은 검색할 수 없습니다. 영수증 상품명으로 저장할 수 있습니다.",
            );
          }
        } finally {
          if (!signal.aborted) setBusy(false);
        }
      });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term, enabled, composing, labelComposing, retry]);
  return (
    <div className="catalog-picker">
      <p>
        <strong>저장할 와인명:</strong>{" "}
        {selected ?? (label || "영수증 상품명을 입력하세요")}
      </p>
      <label>
        공개 와인 DB 검색어
        <input
          value={query}
          maxLength={300}
          onChange={(e) => {
            const next = e.target.value;
            setQuery(next);
            setEnabled(true);
            if (next.trim() !== term) {
              setBusy(false);
              setFailed(false);
              setResult(null);
              setMessage("");
            }
          }}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={() => setComposing(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing)
              e.preventDefault();
          }}
        />
      </label>
      <small>
        두 글자 이상 입력하면 검색어만{" "}
        <a
          className="text-link"
          href="https://www.eclavin.com/wines"
          target="_blank"
          rel="noreferrer"
        >
          Eclavin
        </a>
        에 보내 자동으로 후보를 찾습니다.
      </small>
      <p role="status">{busy ? "와인 후보를 찾는 중…" : message}</p>
      {failed && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setFailed(false);
            setMessage("");
            setRetry((n) => n + 1);
          }}
        >
          다시 검색
        </Button>
      )}
      {result && result.candidates.length > 0 && (
        <ul aria-label="공개 와인 검색 후보">
          {result.candidates.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => {
                  onChoose(w);
                  setMessage("후보를 선택했습니다.");
                }}
              >
                <strong>{w.name}</strong>{" "}
                <small>
                  {[
                    w.original !== w.name ? w.original : null,
                    w.producer,
                    w.country,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setEnabled(false);
            setBusy(false);
            setFailed(false);
            onChoose(null);
            setMessage("영수증 상품명을 사용합니다.");
          }}
        >
          영수증 상품명 그대로 사용
        </Button>
      )}
    </div>
  );
}
