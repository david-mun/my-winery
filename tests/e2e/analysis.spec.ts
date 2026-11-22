import sharp from "sharp";
import { test, expect } from "@playwright/test";
import {
  receiptFixture,
  wineFixture,
  receiptDetailsFixture,
  winePhotoFixture,
} from "../fixtures/analysis";
import type { ReceiptInput } from "../../lib/domain";

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

for (const count of [1, 3]) {
  test(`wine photo purchase supports ${count} bottles and requires manual purchase facts`, async ({
    page,
  }, info) => {
    const analysis = structuredClone(winePhotoFixture);
    analysis.bottle_count = count;
    analysis.bottles = Array.from({ length: count }, (_, index) => {
      const bottle = structuredClone(winePhotoFixture.bottles[0]);
      bottle.position_left_to_right = index + 1;
      bottle.observed.wine!.name = `Photo ${count} ${index} ${info.project.name}`;
      bottle.product_candidate!.name_ko = `사진 구매 ${count} ${index} ${info.project.name}`;
      bottle.product_candidate!.name_en = `Photo Purchase ${count} ${index} ${info.project.name}`;
      return bottle;
    });
    let calls = 0;
    const submitted: ReceiptInput[] = [];
    page.on("request", (req) => {
      if (
        new URL(req.url()).pathname === "/api/purchases" &&
        req.method() === "POST"
      )
        submitted.push(req.postDataJSON());
    });
    await page.route("**/api/analysis/wine-photo", (r) => {
      calls++;
      return r.fulfill({
        json: { task: "wine-photo", analysis, warnings: [] },
      });
    });
    await expect(
      page.getByRole("link", { name: "와인 등록", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("link", { name: "구매 기록 추가", exact: true })
      .click();
    await page.getByRole("radio", { name: /^와인 사진/ }).check();
    await expect(page.getByLabel("구매일 *", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("구매처 *", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("실결제액", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("품목 1 금액")).toHaveValue("");
    // A user can enter purchase facts before analyzing; applying only replaces wine lines.
    await page.getByLabel("구매일 *", { exact: true }).fill("2026-10-12");
    await page.getByLabel("구매처 *", { exact: true }).selectOption("__new__");
    await page
      .getByLabel("새 구매처 이름 *", { exact: true })
      .fill(`사진 구매처 ${count} ${info.project.name}`);
    await page
      .getByLabel("실결제액", { exact: true })
      .fill(String(count * 15000));
    await expect(
      page.getByLabel("와인 사진 선택", { exact: true }),
    ).toBeEnabled();
    await page
      .getByLabel("와인 사진 선택", { exact: true })
      .setInputFiles("public/icons/icon-192.png");
    await expect(
      page.getByRole("button", { name: "Gemini로 분석", exact: true }),
    ).toBeDisabled();
    expect(calls).toBe(0);
    await page
      .getByRole("checkbox", {
        name: "전송할 사진을 확인했고 개인정보를 가렸습니다.",
      })
      .check();
    await page
      .getByRole("button", { name: "Gemini로 분석", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "초안에 적용", exact: true }),
    ).toBeVisible();
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "초안에 적용", exact: true })
      .click();
    await expect(page.getByLabel("병 수", { exact: true })).toHaveCount(count);
    await expect(page.getByLabel("구매일 *", { exact: true })).toHaveValue(
      "2026-10-12",
    );
    await expect(page.getByLabel("구매처 *", { exact: true })).toHaveValue(
      "__new__",
    );
    await expect(page.getByLabel("실결제액", { exact: true })).toHaveValue(
      String(count * 15000),
    );
    for (let index = 0; index < count; index++) {
      await expect(
        page.getByLabel(`품목 ${index + 1} 금액`, { exact: true }),
      ).toHaveValue("");
      await page
        .getByLabel(`품목 ${index + 1} 금액`, { exact: true })
        .fill("15000");
      await page
        .getByRole("complementary", { name: "AI 와인 후보" })
        .nth(index)
        .getByRole("button", { name: "후보 와인명 사용" })
        .click();
    }
    await expect(
      page.getByRole("button", { name: "구매 저장", exact: true }),
    ).toBeDisabled();
    await page.getByRole("checkbox", { name: /와인 사진과 와인 정보/ }).check();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (count === 3)
      await page.screenshot({
        path: `test-results/wine-photo-purchase-${info.project.name}.png`,
        fullPage: true,
      });
    // The source photograph is attached to this purchase, rather than each wine card.
    await page.getByRole("button", { name: "구매 저장", exact: true }).click();
    await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
    expect(calls).toBe(1);
    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      purchased_on: "2026-10-12",
      paid_amount: count * 15000,
      discount_amount: 0,
    });
    expect(submitted[0].merchant_id).toBeTruthy();
    expect(submitted[0].lines[0].wines[0]).toMatchObject({
      country: receiptDetailsFixture.country,
      region: receiptDetailsFixture.region,
      grape: receiptDetailsFixture.grapes.join(", "),
      wine_type: "white",
    });
    expect(JSON.stringify(submitted[0])).not.toContain("analysisDetails");
    await expect(
      page.getByRole("heading", {
        name: "구매 사진 · 영수증 / 와인",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("link", {
        name: analysis.bottles[0].product_candidate!.name_ko!,
        exact: true,
      })
      .click();
    await expect(
      page
        .locator(".detail-hero .subtitle")
        .filter({ hasText: receiptDetailsFixture.summary_ko! }),
    ).toBeVisible();
    await expect(page.locator(".detail-hero .eyebrow")).toContainText(
      receiptDetailsFixture.country!,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("switching photo options cancels old analysis and prevents stale receipt data from entering the wine draft", async ({
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
  await page
    .getByRole("button", { name: "Gemini로 분석", exact: true })
    .click();
  page.once("dialog", (d) => d.dismiss());
  await page.getByRole("radio", { name: /^와인 사진/ }).click();
  await expect(page.getByRole("radio", { name: /^영수증 사진/ })).toBeChecked();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("radio", { name: /^와인 사진/ }).check();
  release();
  await expect(
    page.getByLabel("와인 사진 선택", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "초안에 적용" })).toHaveCount(
    0,
  );
  await expect(page.getByLabel("구매일 *", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("실결제액", { exact: true })).toHaveValue("");
  await page
    .getByLabel("사진 속 와인명", { exact: true })
    .fill("직접 입력 와인");
  await page.getByLabel("구매일 *", { exact: true }).fill("2026-10-13");
  await page.route("**/api/analysis/wine-photo", (r) =>
    r.fulfill({
      status: 429,
      json: { error: "오늘 분석 한도에 도달했습니다." },
    }),
  );
  await page
    .getByLabel("와인 사진 선택", { exact: true })
    .setInputFiles("public/icons/icon-192.png");
  await page
    .getByRole("checkbox", {
      name: "전송할 사진을 확인했고 개인정보를 가렸습니다.",
    })
    .check();
  await page
    .getByRole("button", { name: "Gemini로 분석", exact: true })
    .click();
  await expect(page.getByText("오늘 분석 한도에 도달했습니다.")).toBeVisible();
  await expect(page.getByLabel("사진 속 와인명", { exact: true })).toHaveValue(
    "직접 입력 와인",
  );
  await expect(page.getByLabel("구매일 *", { exact: true })).toHaveValue(
    "2026-10-13",
  );
});

test("Gemini receipt remains local until consent, preserves bundle/discount and requires review", async ({
  page,
}, info) => {
  let calls = 0;
  const receipt = structuredClone(receiptFixture);
  receipt.lines[1].wines[0].details = structuredClone(receiptDetailsFixture);
  const submitted: ReceiptInput[] = [];
  page.on("request", (req) => {
    if (
      new URL(req.url()).pathname === "/api/purchases" &&
      req.method() === "POST"
    )
      submitted.push(req.postDataJSON());
  });
  if (info.project.name === "mobile-390")
    await page.addInitScript(() => {
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        encode.call(
          this,
          callback,
          type === "image/webp" ? "image/png" : type,
          quality,
        );
      };
    });
  await page.route("**/api/analysis/receipt", async (r) => {
    const data = await new Request(r.request().url(), {
      method: "POST",
      headers: { "content-type": r.request().headers()["content-type"] },
      body: new Uint8Array(r.request().postDataBuffer()!).buffer,
    }).formData();
    const file = data.get("file") as File;
    if (info.project.name === "mobile-390")
      expect(file.type).toBe("image/jpeg");
    const pixel = await sharp(Buffer.from(await file.arrayBuffer()))
      .extract({ left: 10, top: 10, width: 1, height: 1 })
      .raw()
      .toBuffer();
    expect([...pixel.subarray(0, 3)]).toEqual([255, 255, 255]);
    calls++;
    return r.fulfill({
      json: { task: "receipt", analysis: receipt, warnings: [] },
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
  const candidate = page.getByRole("complementary", { name: "AI 와인 후보" });
  await expect(
    candidate.getByText("Example Estate Sauvignon Blanc", { exact: true }),
  ).toBeVisible();
  await expect(candidate.getByText("12~13%", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("저장할 와인명", { exact: true }).nth(2),
  ).toHaveValue("가상 와인 C");
  await candidate.getByRole("button", { name: "후보 와인명 사용" }).click();
  await expect(
    page.getByLabel("저장할 와인명", { exact: true }).nth(2),
  ).toHaveValue("가상 상세 와인 C");
  await expect(
    page.getByLabel("영수증 상품명", { exact: true }).nth(1),
  ).toHaveValue("가상 와인 C 2025");
  await expect(
    page.getByRole("button", { name: "구매 저장", exact: true }),
  ).toBeDisabled();
  await page.getByRole("checkbox", { name: /원본 영수증과/ }).check();
  await page
    .getByRole("checkbox", { name: "구매 저장 시 이 사진도 비공개로 첨부" })
    .uncheck();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/gemini-receipt-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "구매 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
  expect(calls).toBe(1);
  expect(submitted[0].lines[1].wines[0].wine_name).toBe("가상 상세 와인 C");
  expect(JSON.stringify(submitted[0])).not.toContain("analysisDetails");
  expect(JSON.stringify(submitted[0])).not.toContain("alcohol_percent");
  expect(submitted[0].lines[1].wines[0].description).toBe(
    receiptDetailsFixture.summary_ko,
  );
  expect(submitted[0].lines[1].wines[0].name_original).toBe(
    receiptDetailsFixture.name_en,
  );
  // DB RPC remains responsible for one bundle amount and NULL allocations.
  await expect(
    page.getByText("가격 미확인", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator('[name="vintage_label"]')).toHaveCount(0);
  await page
    .getByRole("link", { name: "가상 상세 와인 C", exact: true })
    .click();
  await expect(
    page
      .locator(".detail-hero .subtitle")
      .filter({ hasText: receiptDetailsFixture.summary_ko! }),
  ).toBeVisible();
  await expect(page.getByLabel(/빈티지/)).toHaveCount(0);
  await page.goto("/wines");
  const card = page
    .locator(".wine-card")
    .filter({ hasText: "가상 상세 와인 C" });
  await expect(card.locator("h2 + .wine-original")).toHaveText(
    receiptDetailsFixture.name_en!,
  );
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
  await expect(page.getByLabel("와인 설명", { exact: true })).toHaveValue(
    wineFixture.wine!.summary_ko!,
  );
  await expect(
    page.getByRole("button", { name: "와인 저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", { name: "원본 라벨과 와인 상세를 확인했습니다." })
    .check();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/gemini-wine-${info.project.name}.png`,
    fullPage: true,
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

test("vintage controls stay hidden while existing metadata survives edits and new purchases omit vintage", async ({
  page,
}, info) => {
  const headers = { Origin: "http://127.0.0.1:3100" };
  const created = await page.request.post("/api/wines", {
    headers,
    data: {
      name_ko: `선택 정보 테스트 ${info.project.name}`,
      name_original: "Example Estate Blanc",
      producer: null,
      wine_type: "white",
      grape: "샤르도네",
      country: "프랑스",
      region: null,
      description: "기존 와인 설명\n사진 빈티지: 2022",
    },
  });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  const review = await page.request.post("/api/reviews", {
    headers,
    data: {
      wine_id: id,
      vintage_label: "2022",
      my_rating: 4,
      review_text: "기존 개인 노트",
      tasted_on: null,
    },
  });
  expect(review.status()).toBe(200);
  const purchase = await page.request.post("/api/purchases", {
    headers,
    data: {
      merchant_id: null,
      purchased_on: "2026-10-10",
      paid_amount: 10000,
      discount_amount: 0,
      notes: null,
      lines: [
        {
          line_kind: "wine",
          raw_label: "테스트",
          line_amount: 10000,
          wines: [{ wine_id: id, bottle_quantity: 1 }],
        },
      ],
    },
  });
  expect(purchase.status()).toBe(200);
  await page.goto(`/wines/${id}`);
  await expect(page.getByLabel(/빈티지/)).toHaveCount(0);
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(
    "빈티지",
  );
  await page.getByText("노트 수정", { exact: true }).click();
  await page
    .getByLabel("후기", { exact: true })
    .first()
    .fill("수정한 개인 노트");
  const [noteRequest] = await Promise.all([
    page.waitForRequest(
      (req) =>
        req.method() === "PATCH" &&
        new URL(req.url()).pathname.startsWith("/api/reviews/"),
    ),
    page
      .getByRole("button", { name: "시음 노트 저장", exact: true })
      .first()
      .click(),
  ]);
  expect(noteRequest.postDataJSON().vintage_label).toBe("2022");
  await expect(
    page.getByText("시음 노트를 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByText("와인 정보 수정", { exact: true }).click();
  await expect(page.getByLabel("와인 설명", { exact: true })).toHaveValue(
    "기존 와인 설명",
  );
  await page.getByLabel("와인 설명", { exact: true }).fill("수정한 와인 설명");
  const [wineRequest] = await Promise.all([
    page.waitForRequest(
      (req) =>
        req.method() === "PATCH" &&
        new URL(req.url()).pathname === `/api/wines/${id}`,
    ),
    page.getByRole("button", { name: "와인 저장", exact: true }).click(),
  ]);
  expect(wineRequest.postDataJSON().description).toBe(
    "수정한 와인 설명\n사진 빈티지: 2022",
  );
  await expect(
    page
      .locator(".detail-hero .subtitle")
      .filter({ hasText: "수정한 와인 설명" }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.innerText)).not.toContain(
    "빈티지",
  );
  await page.screenshot({
    path: `test-results/no-vintage-${info.project.name}.png`,
    fullPage: true,
  });
});
