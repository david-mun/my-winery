import { pageUser } from "@/lib/auth";
import { Logout } from "@/components/forms";
export default async function Settings() {
  const { user, isAdmin } = await pageUser();
  return (
    <>
      <h1>내 설정</h1>
      <section className="panel">
        <h2>{user.email}</h2>
        <p>{isAdmin ? "관리자" : "일반 사용자"} · 비공개 개인 컬렉션</p>
        <p className="muted">
          구매 병 수는 누적 기록입니다. 현재 보유 수량은 별도로 추정하지
          않습니다.
        </p>
        <Logout />
      </section>
    </>
  );
}
