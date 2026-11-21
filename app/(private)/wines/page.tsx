import { WineList } from "@/components/wines";
import { pageUser } from "@/lib/auth";
import { collection } from "@/lib/data";
export default async function Wines({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db } = await pageUser();
  const p = await searchParams;
  const str = (key: string) =>
    typeof p[key] === "string" ? p[key] : undefined;
  return (
    <WineList
      data={await collection(db)}
      filters={{
        q: str("q"),
        country: str("country"),
        region: str("region"),
        grape: str("grape"),
        type: Array.isArray(p.type) ? p.type : p.type ? [p.type] : [],
        vivinoMin: str("vivinoMin"),
        myMin: str("myMin"),
        sort: str("sort"),
      }}
    />
  );
}
