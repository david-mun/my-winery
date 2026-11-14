import Link from "next/link";
import {
  Wine,
  ReceiptText,
  NotebookPen,
  Settings,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import type { ReactNode } from "react";
export function Shell({
  children,
  admin = false,
  demo = false,
}: {
  children: ReactNode;
  admin?: boolean;
  demo?: boolean;
}) {
  const links = [
    ["/wines", "내 와인", Wine],
    ["/purchases", "구매 내역", ReceiptText],
    ["/reviews", "시음 노트", NotebookPen],
    ["/settings", "설정", Settings],
  ] as const;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href={demo ? "/demo" : "/wines"}>
          <Wine size={29} />
          <span>
            MY WINE LIST<small>나만의 와인 기록</small>
          </span>
        </Link>
        <div className="sidebar-label">MY COLLECTION</div>
        <nav aria-label="주 메뉴">
          {links.map(([href, label, Icon]) => (
            <Link key={href} href={demo ? `/demo?view=${href.slice(1)}` : href}>
              <Icon size={20} />
              {label}
            </Link>
          ))}
          {admin && (
            <Link href="/admin">
              <ShieldCheck size={20} />
              사용자 관리
            </Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          PRIVATE CELLAR
          <p>
            좋았던 한 병을,
            <br />
            오래 기억하는 방법.
          </p>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <Link href={demo ? "/demo" : "/wines"} className="mobile-brand">
            MY WINE LIST
          </Link>
          <span className="desktop-only">나만을 위한 작은 셀러</span>
          <span className="privacy-badge">
            {demo ? "가상 데이터 미리보기" : "비공개 컬렉션"}
          </span>
          {demo && (
            <Link href="/login">
              로그인 <ArrowUpRight size={15} />
            </Link>
          )}
        </header>
        {demo && (
          <div className="demo-notice">
            가상의 와인과 점수로 구성한 읽기 전용 예시입니다. 실제 구매 데이터와
            연결되지 않습니다.
          </div>
        )}
        <main id="main-content">{children}</main>
        <footer>
          MY WINE LIST <span>한 병의 기억을 차곡차곡.</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {links.map(([href, label, Icon]) => (
          <Link key={href} href={demo ? `/demo?view=${href.slice(1)}` : href}>
            <Icon size={21} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
