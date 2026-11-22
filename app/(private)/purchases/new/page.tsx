import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
import { ReceiptForm } from "@/components/forms";
export default async function NewPurchase({
  searchParams,
}: {
  searchParams: Promise<{ wine?: string }>;
}) {
  const { db } = await pageUser();
  return (
    <>
      <h1>구매 기록 추가</h1>
      <section className="panel">
        <ReceiptForm
          data={await collection(db)}
          wineId={(await searchParams).wine}
        />
      </section>
    </>
  );
}
