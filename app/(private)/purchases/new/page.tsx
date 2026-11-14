import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
import { ReceiptForm, MerchantForm } from "@/components/forms";
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
      <section className="panel">
        <details>
          <summary className="text-link">구매처 추가</summary>
          <MerchantForm />
        </details>
      </section>
    </>
  );
}
