import { notFound } from "next/navigation";
import { pageUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { UserControl } from "@/components/forms";
export default async function UserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { db } = await pageUser(true),
    { id } = await params;
  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!profile) notFound();
  const { data: role } = await db
    .from("app_user_roles")
    .select("role")
    .eq("user_id", id)
    .single();
  const { data: auth } = await adminClient().auth.admin.getUserById(id);
  const { data: logs } = await db
    .from("admin_audit_logs")
    .select("*")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return (
    <>
      <h1>계정 상세</h1>
      <section className="panel">
        <h2>{auth.user?.email}</h2>
        <p>현재 상태: {profile.status}</p>
        <UserControl
          id={id}
          status={profile.status}
          role={role?.role ?? "member"}
        />
        <p className="muted">
          영구 삭제 대신 비활성화를 제공합니다. 마지막 활성 관리자는 보호됩니다.
        </p>
      </section>
      <section className="panel">
        <h2>계정 작업 이력</h2>
        {logs?.map((l) => (
          <div className="record-row" key={l.id}>
            <span>{l.action}</span>
            <small>{l.created_at}</small>
          </div>
        ))}
      </section>
    </>
  );
}
