import { redirect } from "next/navigation";
import { hasSupabaseConfiguration } from "@/lib/env";
import { AuthForm } from "@/components/forms";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (!hasSupabaseConfiguration()) redirect("/setup");
  return <AuthForm notice={(await searchParams).notice} />;
}
