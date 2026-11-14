import "server-only";
import { redirect } from "next/navigation";
import { supabase } from "./supabase/server";
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function requireUser(admin = false) {
  const db = await supabase();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) throw new AppError(401, "로그인이 필요합니다.");
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,status,display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError)
    throw new AppError(503, "DB 설정이 아직 완료되지 않았습니다.");
  if (!profile || profile.status !== "active")
    throw new AppError(403, "초대 수락 또는 계정 활성화가 필요합니다.");
  const { data: role } = await db
    .from("app_user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (admin && role?.role !== "admin")
    throw new AppError(403, "관리자만 사용할 수 있습니다.");
  return { db, user, profile, isAdmin: role?.role === "admin" };
}
export async function pageUser(admin = false) {
  try {
    return await requireUser(admin);
  } catch (e) {
    if (e instanceof AppError) {
      if (e.status === 401) redirect("/login");
      redirect("/login?notice=" + encodeURIComponent(e.message));
    }
    throw e;
  }
}
