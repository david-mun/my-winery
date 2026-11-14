import { AuthForm } from "@/components/forms";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  return <AuthForm notice={(await searchParams).notice} />;
}
