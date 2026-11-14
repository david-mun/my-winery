import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
function sign(value: string) {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("SERVER_NOT_CONFIGURED");
  return createHmac("sha256", secret).update(value).digest("hex");
}
export async function setProof(user: string, flow: "invite" | "recovery") {
  const raw = `${user}:${flow}:${Date.now() + 600000}`;
  (await cookies()).set("wine-auth-proof", `${raw}:${sign(raw)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}
export async function checkProof(user: string, flow: string) {
  const value = (await cookies()).get("wine-auth-proof")?.value ?? "";
  const parts = value.split(":");
  if (parts.length !== 4) return false;
  const raw = parts.slice(0, 3).join(":"),
    a = Buffer.from(parts[3]),
    b = Buffer.from(sign(raw));
  return (
    a.length === b.length &&
    timingSafeEqual(a, b) &&
    parts[0] === user &&
    parts[1] === flow &&
    Number(parts[2]) > Date.now()
  );
}
export async function clearProof() {
  (await cookies()).delete("wine-auth-proof");
}
