import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main-content">
      <h1>찾을 수 없는 페이지입니다</h1>
      <Link className="text-link" href="/wines">
        내 와인으로 돌아가기
      </Link>
    </main>
  );
}
