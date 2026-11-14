import { it, expect } from "vitest";
import { lookupWine } from "../lib/wine-catalog";
const row = (id: string, name: string) => ({
  id,
  name_ko: name,
  producer: "예시 생산자",
});
it("searches public names with POS notation removed and accepts only a unique complete name match", async () => {
  const q: string[] = [];
  const result = await lookupWine(
    "(P)루나힐 소비뇽블랑25 750ml",
    async (term) => {
      q.push(term);
      return { total: 1, items: [row("a", "루나 힐 소비뇽 블랑")] };
    },
  );
  expect(q).toEqual(["루나힐 소비뇽블랑"]);
  expect(result.exactId).toBe("a");
  for (const total of [2, 15]) {
    expect(
      (
        await lookupWine("루나힐", async () => ({
          total,
          items: [row("a", "루나 힐"), row("b", "루나힐")],
        }))
      ).exactId,
    ).toBeNull();
  }
});
it("broadens an abbreviated name after a miss and returns optional candidates", async () => {
  const calls: string[] = [];
  const result = await lookupWine("루나힐 쇼블25", async (term) => {
    calls.push(term);
    return term === "루나"
      ? { total: 1, items: [row("a", "루나 힐 소비뇽 블랑")] }
      : { total: 0, items: [] };
  });
  expect(calls.at(-1)).toBe("루나");
  expect(result.candidates[0].id).toBe("a");
  expect(result.exactId).toBeNull();
  expect(
    await lookupWine("새상품", async () => ({ total: 0, items: [] })),
  ).toEqual({ exactId: null, candidates: [] });
});
