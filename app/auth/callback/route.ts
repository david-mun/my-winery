import { serverEnv } from "@/lib/env";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/server";
import { setProof } from "@/lib/auth-proof";
import { safeNext } from "@/lib/security";
export async function GET(req: Request) {
  const url = new URL(req.url),
    base = serverEnv().appUrl ?? url.origin;
  const db = await supabase(),
    type = url.searchParams.get("type"),
    hash = url.searchParams.get("token_hash"),
    code = url.searchParams.get("code");
  let ok = false;
  let verifiedFlow: "invite" | "recovery" | undefined;
  if (hash && (type === "invite" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type });
    ok = !error;
    if (ok) verifiedFlow = type;
  } else if (code && !type && !hash) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    ok = !error;
  }
  if (ok) {
    const {
      data: { user },
    } = await db.auth.getUser();
    if (user) {
      if (verifiedFlow) {
        await setProof(user.id, verifiedFlow);
        return NextResponse.redirect(
          new URL(
            verifiedFlow === "invite" ? "/welcome" : "/reset-password",
            base,
          ),
        );
      }
      return NextResponse.redirect(
        new URL(safeNext(url.searchParams.get("next")), base),
      );
    }
  }
  return NextResponse.redirect(
    new URL(
      "/login?notice=" +
        encodeURIComponent(
          "인증 링크가 만료되었거나 올바르지 않습니다. 다시 요청해 주세요.",
        ),
      base,
    ),
  );
}
