import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { InviteForm } from "@/components/forms";
export default async function Admin() {
  const { db } = await pageUser(true);
  const [{ data: profiles }, { data: invites }, { data: logs }] =
    await Promise.all([
      db.from("profiles").select("id,status"),
      db
        .from("invitations")
        .select("*")
        .order("created_at", { ascending: false }),
      db
        .from("admin_audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  return (
    <>
      <p className="eyebrow">ACCESS MANAGEMENT</p>
      <h1>사용자 관리</h1>
      <p className="subtitle">
        계정 접근만 관리합니다. 다른 사용자의 컬렉션은 공개되지 않습니다.
      </p>
      <section className="panel">
        <h2>등록 계정 {profiles?.length ?? 0}명</h2>
        <Link className="text-link" href="/admin/users">
          사용자 목록 →
        </Link>
        <InviteForm />
      </section>
      <section className="panel">
        <h2>초대 상태</h2>
        {invites?.map((i) => (
          <div className="record-row" key={i.id}>
            <span>{i.email}</span>
            <span>{i.state}</span>
          </div>
        ))}
      </section>
      <section className="panel">
        <h2>최근 관리자 작업</h2>
        {logs?.map((l) => (
          <div className="record-row" key={l.id}>
            <span>{l.action}</span>
            <small>
              {new Date(l.created_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
              })}
            </small>
          </div>
        ))}
      </section>
    </>
  );
}
