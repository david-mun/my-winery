"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main-content">
      <div className="panel">
        <h1>잠시 연결을 확인해 주세요</h1>
        <p>
          자료를 불러오지 못했습니다. 네트워크 연결과 DB 설정을 확인한 뒤 다시
          시도해 주세요.
        </p>
        <Button onClick={reset}>다시 시도</Button>
      </div>
    </main>
  );
}
