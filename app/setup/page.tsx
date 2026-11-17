import Link from "next/link";
import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/lib/env";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export default function Setup() {
  if (hasSupabaseConfiguration()) redirect("/wines");
  return (
    <main
      id="main-content"
      style={{
        padding: 24,
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
      }}
    >
      <section
        className="panel"
        style={{ maxWidth: 640, margin: "48px auto", padding: 28 }}
      >
        <p className="eyebrow">MY WINE LIST</p>
        <h1 style={{ wordBreak: "keep-all" }}>서비스 연결 설정이 필요합니다</h1>
        <p>이 배포에는 개인 셀러 연결이 아직 설정되지 않았습니다.</p>
        <p>
          가상 데모는 바로 둘러볼 수 있습니다. 실제 로그인과 사진 분석은 연결
          설정이 완료되면 사용할 수 있습니다.
        </p>
        <div className="form-actions">
          <Button asChild>
            <Link href="/demo">가상 데모 둘러보기</Link>
          </Button>
        </div>
        <p className="muted">
          이 주소에서 실제 기능을 사용하려면 관리자에게 해당 배포의 연결 설정을
          요청해 주세요.
        </p>
      </section>
    </main>
  );
}
