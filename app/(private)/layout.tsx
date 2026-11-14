import { pageUser } from "@/lib/auth";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAdmin } = await pageUser();
  return <Shell admin={isAdmin}>{children}</Shell>;
}
