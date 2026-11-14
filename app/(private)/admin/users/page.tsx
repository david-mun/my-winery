import Link from "next/link";
import { pageUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
export default async function Users() {
  const { db } = await pageUser(true);
  const { data: auth, error } = await adminClient().auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error("계정 조회 실패");
  const { data: profiles } = await db.from("profiles").select("*");
  return (
    <>
      <h1>사용자 계정</h1>
      <section className="panel">
        {auth.users.map((u) => (
          <Link key={u.id} className="record-row" href={"/admin/users/" + u.id}>
            <span>{u.email}</span>
            <span>
              {profiles?.find((p) => p.id === u.id)?.status ?? "앱 접근 미허용"}{" "}
              →
            </span>
          </Link>
        ))}
      </section>
    </>
  );
}
