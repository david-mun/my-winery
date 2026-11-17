import sharp from "sharp";
import { test, expect } from "@playwright/test";
import { receiptFixture, wineFixture } from "../fixtures/analysis";

test.beforeEach(async ({ page }, info) => {
  await page.route("**/api/wine-search", (r) =>
    r.fulfill({ json: { candidates: [], exactId: null } }),
  );
  await page.goto("/login");
  await page
    .getByLabel("이메일", { exact: true })
    .fill(`member-${info.project.name}@example.test`);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("LocalTestPassword123!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/wines$/);
});

test("Gemini receipt remains local until consent, preserves bundle/discount and requires review", async ({
  page,
}, info) => {
  let calls = 0;
  await page.route("**/api/analysis/receipt", async (r) => {
    const data = await new Request(r.request().url(), {
      method: "POST",
      headers: { "content-type": r.request().headers()["content-type"] },
      body: new Uint8Array(r.request().postDataBuffer()!).buffer,
    }).formData();
    const file = data.get("file") as File;
    const pixel = await sharp(Buffer.from(await file.arrayBuffer()))
      .extract({ left: 10, top: 10, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 255, 255]);
    calls++;
    return r.fulfill({
      json: { task: "receipt", analysis: receiptFixture, warnings: [] },
    });
  });
  await page.goto("/purchases/new");
  await expect(
    page.getByLabel("영수증 사진 선택", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("영수증 사진 선택", { exact: true })
    .setInputFiles("public/icons/icon-192.png");
  await expect(
    page.getByRole("img", { name: "전송할 영수증 미리보기" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Gemini로 분석" }),
  ).toBeDisabled();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "상단 가리기" }).click();
  await page
    .getByRole("checkbox", {
      name: "전송할 사진을 확인했고 개인정보를 가렸습니다.",
    })
    .check();
  await page.getByRole("button", { name: "Gemini로 분석" }).click();
  await expect(page.getByRole("button", { name: "초안에 적용" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "초안에 적용" }).click();
  await expect(page.getByLabel("품목 1 금액")).toHaveValue("39900");
  await expect(page.getByLabel("영수증 할인", { exact: true })).toHaveValue(
    "18000",
  );
  await expect(page.getByLabel("실결제액", { exact: true })).toHaveValue(
    "41900",
  );
  await expect(page.getByLabel("병 수", { exact: true })).toHaveCount(3);
  await expect(page.getByLabel("병 수", { exact: true }).nth(2)).toHaveValue(
    "2",
  );
  await expect(
    page.getByRole("button", { name: "구매 저장", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /원본 영수증과/ }).check();
  await page
    .getByRole("checkbox", { name: "구매 저장 시 이 사진도 비공개로 첨부" })
    .uncheck();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/gemini-receipt-${info.project.name}.png`,fullPage:true,
  });
  await page.getByRole("button", { name: "구매 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
  expect(calls).toBe(1);
  // DB RPC remains responsible for one bundle amount and NULL allocations.
  await expect(
    page.getByText("가격 미확인", { exact: false }).first(),
  ).toBeVisible();
});

test("wine label fills editable details and saving a photo creates only one wine", async ({
  page,
}, info) => {
  const analysis = structuredClone(wineFixture);
  analysis.wine!.name = `Photo Blanc ${info.project.name}`;
  await page.route("**/api/analysis/wine-label", (r) =>
    r.fulfill({ json: { task: "wine-label", analysis, warnings: [] } }),
  );
  let creates = 0,
    uploads = 0;
  page.on("request", (req) => {
    if (new URL(req.url()).pathname === "/api/wines" && req.method() === "POST")
      creates++;
  });
  await page.route("**/api/media", (r) => {
    uploads++;
    return uploads === 1
      ? r.fulfill({ status: 503, json: { error: "test photo failure" } })
      : r.continue();
  });
  await page.goto("/wines/new");
  await expect(
    page.getByLabel("와인 라벨 사진 선택", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("와인 라벨 사진 선택", { exact: true })
    .setInputFiles("public/icons/icon-192.png");
  await expect(
    page.getByRole("img", { name: "전송할 와인 라벨 미리보기" }),
  ).toHaveJSProperty("width", 192);
  await page.getByText("키보드로 영역 지정", { exact: true }).click();
  await page.getByLabel("가로 (%)", { exact: true }).fill("50");
  await page
    .getByRole("button", { name: "지정한 영역 적용", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "전송할 와인 라벨 미리보기" }),
  ).toHaveJSProperty("width", 96);
  await page
    .getByRole("checkbox", {
      name: "전송할 사진을 확인했고 개인정보를 가렸습니다.",
    })
    .check();
  await page.getByRole("button", { name: "Gemini로 분석" }).click();
  await page.getByRole("button", { name: "초안에 적용" }).click();
  await expect(page.getByLabel("와인 이름 *", { exact: true })).toHaveValue(
    `Photo Blanc ${info.project.name}`,
  );
  await expect(page.getByLabel("메모", { exact: true })).toHaveValue(
    "사진 빈티지: 2025",
  );
  await expect(
    page.getByRole("button", { name: "와인 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "원본 라벨과 와인 상세를 확인했습니다." })
    .check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({
    path: `test-results/gemini-wine-${info.project.name}.png`,fullPage:true,
  });
  await page.getByRole("button", { name: "와인 저장", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "사진 다시 첨부", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "사진 다시 첨부", exact: true })
    .click();
  await expect(page).toHaveURL(/\/wines\/[0-9a-f-]+$/);
  await expect(page.getByAltText("내 와인 사진")).toBeVisible();
  expect(creates).toBe(1);
  expect(uploads).toBe(2);
  const saved = page.url();
  await page.goto("/wines/new");
  await page
    .getByLabel("와인 이름 *", { exact: true })
    .fill(`Photo Blanc ${info.project.name}`);
  await expect(
    page.getByRole("link", { name: "기존 와인 확인", exact: true }),
  ).toHaveAttribute("href", new URL(saved).pathname);
  await expect(
    page.getByRole("button", { name: "와인 저장", exact: true }),
  ).toBeDisabled();
});

test("cancellation ignores late results and failures preserve manual input", async ({
  page,
}) => {
  let release: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/analysis/receipt", async (r) => {
    await wait;
    try {
      await r.fulfill({
        json: { task: "receipt", analysis: receiptFixture, warnings: [] },
      });
    } catch {}
  });
  await page.goto("/purchases/new");
  await page
    .getByLabel("영수증 상품명", { exact: true })
    .fill("직접 입력 와인");
  await expect(
    page.getByLabel("영수증 사진 선택", { exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("영수증 사진 선택", { exact: true })
    .setInputFiles("public/icons/icon-192.png");
  await page
    .getByRole("checkbox", {
      name: "전송할 사진을 확인했고 개인정보를 가렸습니다.",
    })
    .check();
  await page.getByRole("button", { name: "Gemini로 분석" }).click();
  await page.getByRole("button", { name: "분석 취소", exact: true }).click();
  release();
  await expect(page.getByRole("button", { name: "초안에 적용" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("영수증 상품명", { exact: true })).toHaveValue(
    "직접 입력 와인",
  );
  await page.unroute("**/api/analysis/receipt");
  await page.route("**/api/analysis/receipt", (r) =>
    r.fulfill({
      status: 429,
      json: { error: "오늘 분석 한도에 도달했습니다." },
    }),
  );
  await page.getByRole("button", { name: "Gemini로 분석" }).click();
  await expect(page.getByText("오늘 분석 한도에 도달했습니다.")).toBeVisible();
  await expect(page.getByLabel("영수증 상품명", { exact: true })).toHaveValue(
    "직접 입력 와인",
  );
  const denial = await page.request.post("/api/analysis/receipt", {
    headers: { Origin: "https://evil.test" },
  });
  expect(denial.status()).toBe(403);
});
