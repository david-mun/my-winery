import { hasSupabaseConfiguration } from "@/lib/env";
import { AuthForm } from "@/components/forms";
import { supabase } from "@/lib/supabase/server";
import { checkProof } from "@/lib/auth-proof";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Reset() {
  if (!hasSupabaseConfiguration()) redirect("/setup");
  const db = await supabase();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user || !(await checkProof(user.id, "recovery")))
    redirect("/login?notice=유효한%20재설정%20링크로%20접속해%20주세요.");
  return <AuthForm flow="recovery" />;
}
