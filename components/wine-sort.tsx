"use client";

import { useRouter } from "next/navigation";

export function WineSort({ sort }: { sort: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="정렬"
      name="sort"
      defaultValue={sort}
      onChange={(event) => {
        const url = new URL(window.location.href);
        url.searchParams.set("sort", event.currentTarget.value);
        router.push(url.pathname + url.search, { scroll: false });
      }}
    >
      <option value="latest">최근 구매순</option>
      <option value="name">이름순</option>
      <option value="vivino">Vivino 높은순</option>
      <option value="mine">내 평점 높은순</option>
      <option value="priceAsc">최근 단가 낮은순</option>
      <option value="priceDesc">최근 단가 높은순</option>
    </select>
  );
}
