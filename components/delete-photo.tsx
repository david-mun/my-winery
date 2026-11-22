"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "./ui/button";

export function DeletePhoto({
  id,
  kind,
}: {
  id: string;
  kind: "wine" | "receipt";
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        const result = await response.json().catch(() => null);
        throw new Error(
          result?.error ?? "사진을 삭제하지 못했습니다. 다시 시도해 주세요.",
        );
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "사진을 삭제하지 못했습니다.",
      );
      setBusy(false);
    }
  }
  if (!confirming) {
    return (
      <Button
        variant="danger"
        type="button"
        onClick={() => setConfirming(true)}
      >
        <Trash2 size={15} />
        사진 삭제
      </Button>
    );
  }
  return (
    <div>
      <p>
        {kind === "wine"
          ? "이 와인과 연결된 구매 내역에서 이 사진을 삭제할까요?"
          : "이 구매 사진을 삭제할까요?"}
      </p>
      <div className="form-actions">
        <Button type="button" variant="danger" disabled={busy} onClick={remove}>
          {busy ? "삭제 중…" : "삭제 확인"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setConfirming(false);
            setError("");
          }}
        >
          취소
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
