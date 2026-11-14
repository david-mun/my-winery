import { test, expect } from "@playwright/test";
// Browser checks must not send fixture receipt labels to the live catalogue.
test.beforeEach(async ({ page }) => {
  await page.route("**/api/wine-search", route => route.fulfill({json:{candidates:[], exactId:null}}));
});
test("private routes require authentication and direct API calls cannot mutate", async ({
  page,
  request,
}) => {
  await page.goto("/wines");
  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toBeVisible();
  for (const path of ["/admin", "/purchases", "/reviews"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
  const denial = await request.post("/api/wines", {
    headers: { Origin: "http://127.0.0.1:3100" },
    data: { name_ko: "unauthorized" },
  });
  expect(denial.status()).toBe(401);
  const csrf = await request.post("/api/admin/invite", {
    headers: { Origin: "https://evil.example" },
    data: { email: "nobody@example.com" },
  });
  expect(csrf.status()).toBe(403);
  await page.goto("/welcome");
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/\/login/);
  for (const flow of ["invite", "recovery"]) {
    const callback = await request.get("/auth/callback?code=untrusted&type=" + flow, { maxRedirects: 0 });
    expect(new URL(callback.headers().location).pathname).toBe("/login");
    expect(callback.headers()["set-cookie"] ?? "").not.toContain("wine-auth-proof=");
  }
});
test("fictional collection search, filters and detail work without layout overflow", async ({
  page,
}, info) => {
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: /내 와인 컬렉션/ }),
  ).toBeVisible();
  await expect(page.locator(".wine-card")).toHaveCount(4);
  const vivino = page.getByRole("slider", { name: "Vivino 평점 최솟값" });
  await vivino.press("End");
  for (let i = 0; i < 8; i++) await vivino.press("ArrowLeft");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.locator(".wine-card")).toHaveCount(1);
  await expect(page.locator(".wine-card .origin")).toContainText("🇳🇿");
  const mine = page.getByRole("slider", { name: "내 평점 최솟값" });
  await mine.press("End");
  for (let i = 0; i < 9; i++) await mine.press("ArrowLeft");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.getByText("검색 결과가 없습니다")).toBeVisible();
  await page.getByRole("link", { name: "초기화", exact: true }).click();
  await expect(page.locator(".wine-card")).toHaveCount(4);
  await page.getByLabel("와인 검색").fill("루나");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.locator(".wine-card")).toHaveCount(1);
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator(".wine-card .wine-tasting-note")).toContainText(
    "산뜻한 향과 여운.",
  );
  await page.locator(".wine-card").click();
  await expect(
    page.getByRole("heading", { name: "루나 힐 소비뇽 블랑" }),
  ).toBeVisible();
  await expect(page.getByText("현재 보유량 미확인")).toBeVisible();
  await page.goto("/demo");
  await page.getByLabel("와인 종류").selectOption("red");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(page.locator(".wine-card")).toHaveCount(1);
  await page.getByRole("link", { name: "초기화", exact: true }).click();
  await expect(page.locator(".wine-card")).toHaveCount(4);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/collection-${info.project.name}.png`,
    fullPage: true,
  });
});
test("receipt editor rejects mismatch, keeps bundles unallocated and validates locally", async ({
  page,
}) => {
  await page.goto("/demo?view=purchases");
  await page.getByLabel("영수증 상품명",{exact:true}).fill("세트 예시");
  await page.getByLabel("품목 1 금액").fill("39900");
  await expect(page.getByRole("button", { name: "입력 검증" })).toBeDisabled();
  await page.getByLabel("품목 종류").selectOption("bundle");
  await expect(
    page.getByText("세트 총액만 기록합니다.", { exact: false }),
  ).toBeVisible();
  await page.getByLabel("실결제액", { exact: true }).fill("39900");
  await page.getByRole("button", { name: "입력 검증" }).click();
  await expect(
    page.getByText("금액 검증 통과 · 데모에서는 저장하지 않습니다."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("manifest and original install icons are available", async ({
  request,
}) => {
  const result = await request.get("/manifest.webmanifest");
  expect(result.ok()).toBe(true);
  const data = await result.json();
  expect(data.display).toBe("standalone");
  expect(data.start_url).toBe("/wines");
  expect((await request.get("/icons/icon-192.png")).ok()).toBe(true);
});
test("authenticated owner can create wine, receipt, note, edit and delete without leaking to another account", async ({
  page,
  request,
}, info) => {
  await page.goto("/login");
  await page
    .getByLabel("이메일", { exact: true })
    .fill(`member-${info.project.name}@example.test`);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("LocalTestPassword123!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/wines$/);
  await page.getByRole("link", { name: "와인 등록", exact: true }).click();
  await page
    .getByLabel("와인 이름 *", { exact: true })
    .fill("테스트 셀러 " + info.project.name);
  await page.getByLabel("국가", { exact: true }).fill("프랑스");
  await page.getByRole("button", { name: "와인 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/wines\/[0-9a-f-]+$/);
  const wineUrl = page.url();
  await page.getByLabel('이미지 첨부 · JPEG/PNG/WebP, 10MB 이하').setInputFiles('public/icons/icon-192.png');
  await page.getByRole('button',{name:'비공개 업로드',exact:true}).click();
  await expect(page.getByAltText('내 와인 사진')).toBeVisible();
  await expect.poll(()=>page.getByAltText('내 와인 사진').evaluate((el:HTMLImageElement)=>el.naturalWidth)).toBeGreaterThan(0);

  const photo = page.getByAltText("내 와인 사진");
  const photoUrl = await photo.getAttribute("src");
  await page.reload();
  const cover = page.locator(".detail-hero img");
  await expect(cover).toHaveAttribute("src", photoUrl!);
  await expect(cover).toHaveCSS("object-fit", "contain");
  await expect.poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(photo).toBeVisible();
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(photo).toHaveCount(0);
  await expect(page.locator(".detail-hero .bottle-art")).toBeVisible();
  expect((await page.request.get(photoUrl!)).status()).toBe(404);
  await page.getByLabel("내 평점", { exact: true }).fill("4.3");
  await page.getByLabel("후기", { exact: true }).fill("첫 시음 기록");
  await page
    .getByRole("button", { name: "시음 노트 저장", exact: true })
    .click();
  await expect(
    page.locator(".review-text").filter({ hasText: "첫 시음 기록" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "구매 기록 추가", exact: true }).click();
  await page.getByLabel("품목 1 금액").fill("25000");
  await page.getByLabel("영수증 할인", { exact: true }).fill("1000");
  await page.getByLabel("실결제액", { exact: true }).fill("24000");
  await page.locator("summary").filter({hasText:"와인 병 사진"}).first().click();
  await page.getByLabel("내 병 사진 선택", {exact:true}).setInputFiles("public/icons/icon-512.png");
  await expect(page.getByText("구매를 저장할 때 병 사진도 첨부합니다.")).toBeVisible();
  await page.getByRole("button", { name: "구매 저장", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases\/[0-9a-f-]+$/);
  const receiptUrl = page.url();
  await expect(page.getByAltText("구매한 와인 병 사진")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "실결제 24,000원", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "사진 삭제", exact: true }).click();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(page.getByAltText("구매한 와인 병 사진")).toHaveCount(0);
  await page.getByText("구매 기록 수정", { exact: true }).click();
  await page.getByLabel("영수증 할인", { exact: true }).fill("2000");
  await page.getByLabel("실결제액", { exact: true }).fill("23000");
  await page.getByRole("button", { name: "구매 저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "실결제 23,000원", exact: true }),
  ).toBeVisible();
  await page.goto(wineUrl);
  await expect(page.getByText("1회 · 1병", { exact: true })).toBeVisible();
  const denied = await page.request.get("/api/admin/users");
  expect(denied.status()).toBe(403);
  const anon = await request.get(wineUrl);
  expect(await anon.text()).not.toContain('테스트 셀러 '+info.project.name);
  // App Router may stream the login redirect; the browser navigation test above checks its destination.
  await page.goto(receiptUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "영수증 삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/purchases$/);
  await page.goto(wineUrl);
  await expect(
    page.locator(".review-text").filter({ hasText: "첫 시음 기록" }),
  ).toBeVisible();
  await expect(page.getByText("0회 · 0병", { exact: true })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "와인 삭제", exact: true }).click();
  await expect(page).toHaveURL(/\/wines$/);
  await page.goto("/settings");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(wineUrl);
  await expect(page).toHaveURL(/\/login/);
});

test("admin invitation, acceptance and account deactivation are enforced", async ({
  page,
  browser,
}, info) => {
  await page.goto("/login");
  await page
    .getByLabel("이메일", { exact: true })
    .fill(`admin-${info.project.name}@example.test`);
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("LocalTestPassword123!");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(/\/wines$/);
  await page.goto("/admin");
  const email = `invited-${info.project.name}@example.test`;
  await page
    .getByLabel("초대할 이메일 (재발송 시 같은 이메일 입력)")
    .fill(email);
  await page
    .getByRole("button", { name: "초대 / 재발송", exact: true })
    .click();
  await expect(page.getByText("초대 메일을 발송했습니다.")).toBeVisible();
  const users = await (await page.request.get("/api/admin/users")).json();
  const invited = users.users.find((u: { email: string }) => u.email === email);
  expect(invited.status).toBe("invited");
  const context = await browser.newContext();
  const guest = await context.newPage();
  await guest.goto(
    `http://127.0.0.1:3100/auth/callback?token_hash=${invited.id}&type=invite`,
  );
  await expect(guest).toHaveURL(/\/welcome$/);
  await guest
    .getByLabel("비밀번호", { exact: true })
    .fill("NewLocalPassword123!");
  await guest
    .getByLabel("비밀번호 확인", { exact: true })
    .fill("NewLocalPassword123!");
  await guest
    .getByRole("button", { name: "비밀번호 저장", exact: true })
    .click();
  await expect(guest).toHaveURL(/\/wines$/);
  await page.goto("/admin/users/" + invited.id);
  await page.getByLabel("계정 상태").selectOption("disabled");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "변경", exact: true }).click();
  await expect(page.getByText("계정 설정을 변경했습니다.")).toBeVisible();
  await guest.goto("http://127.0.0.1:3100/wines");
  await expect(guest).toHaveURL(/\/login/);
  expect(
    (await guest.request.get("http://127.0.0.1:3100/api/admin/users")).status(),
  ).toBe(403);
  await context.close();
});

test("pasted OCR text creates a reviewable, unsaved receipt draft", async ({page})=>{
  await page.goto("/demo?view=purchases");
  await page.getByText("OCR 텍스트로 구매 내역 입력", {exact:true}).click();
  await page.getByLabel("영수증 OCR 텍스트").fill(["예시마트","품명","001 테스트 와인","100001","12,000","2","24,000","002 쿠폰","1,000","-1","-1,000","합계액: 23,000","[승인일자]20261010"].join("\n"));
  await page.getByRole("button",{name:"초안 채우기"}).click();
  await expect(page.getByText("검색 결과가 없습니다.",{exact:false})).toBeVisible();
  await expect(page.getByLabel("구매일 *")).toHaveValue("2026-10-10");
  await expect(page.getByLabel("품목 1 금액")).toHaveValue("24000");
  await expect(page.getByLabel("영수증 할인",{exact:true})).toHaveValue("1000");
  await expect(page.getByLabel("실결제액",{exact:true})).toHaveValue("23000");
  await expect(page.getByLabel("영수증 OCR 텍스트")).toHaveValue("");
  await expect(page.getByText("저장할 와인명:").locator("..")).toContainText("테스트 와인");
  await expect(page.getByRole("button",{name:"입력 검증"})).toBeDisabled();
  await page.getByRole("checkbox",{name:/원본 영수증/}).check();
  await page.getByRole("button",{name:"입력 검증"}).click();
  await expect(page.getByText("금액 검증 통과 · 데모에서는 저장하지 않습니다.")).toBeVisible();
});

test("public wine search offers candidates and preserves the receipt label when skipped or reset",async({page})=>{
  await page.route("**/api/wine-search",async route=>{
    expect(route.request().postDataJSON()).toEqual({q:"예시 상품명"});
    await route.fulfill({json:{candidates:[{id:"wine-1",name:"예시 정식명",producer:"생산자",original:"Example",country:"프랑스"}],exactId:null}});
  });
  await page.goto("/demo?view=purchases");
  const label=page.getByLabel("영수증 상품명",{exact:true});
  await label.fill("예시 초안");
  await label.fill("예시 상품명");
  await expect(page.getByRole("list",{name:"공개 와인 검색 후보"})).toBeVisible();
  const name=page.getByText("저장할 와인명:").locator("..");
  await expect(name).toContainText("예시 상품명");
  await page.getByRole("button",{name:/예시 정식명/}).click();
  await expect(name).toContainText("예시 정식명");
  await expect(label).toHaveValue("예시 상품명");
  await page.getByRole("button",{name:"영수증 상품명 그대로 사용"}).click();
  await expect(name).toContainText("예시 상품명");
});

test("reads a selected receipt photograph locally into editable OCR text",async({page},info)=>{
  test.skip(info.project.name!=="desktop" && info.project.name!=="mobile-390","Real OCR on desktop and mobile layout");
  test.setTimeout(60000);
  await page.goto("/demo?view=purchases");
  const png=await page.evaluate(()=>{
    const c=document.createElement("canvas");c.width=1100;c.height=530;
    const ctx=c.getContext("2d")!;ctx.fillStyle="white";ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle="black";ctx.font="34px sans-serif";
    ["SAMPLE WINE MARKET","품명 단가 수량 금액","001 SAMPLE WINE 12000 1 12000","합계액: 12000"].forEach((line,i)=>ctx.fillText(line,50,80+80*i));
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("사진 선택",{exact:true}).setInputFiles({name:"fictional-receipt.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
  await expect(page.getByLabel("영수증 OCR 텍스트")).toHaveValue(/SAMPLE/i,{timeout:45000});
  await expect(page.getByRole("button",{name:"초안 채우기"})).toBeEnabled();
  await expect(page.getByAltText("선택한 영수증 미리보기")).toBeVisible();
});

test("offers licensed bottle images for the selected wine and lets the owner replace one with a camera file",async({page})=>{
  await page.route("**/api/wine-search",r=>r.fulfill({json:{exactId:"v",candidates:[{id:"v",name:"가상 와인",original:"Example Estate",producer:"Example",country:"FR"}]}}));
  await page.route("https://commons.wikimedia.org/w/api.php?**", r=>{
    expect(new URL(r.request().url()).searchParams.get("gsrsearch")).toBe("Example Estate wine");
    return r.fulfill({json:{query:{pages:[{pageid:777,title:"File:Example Wine.jpg",imageinfo:[{url:"https://upload.wikimedia.org/wikipedia/commons/1/11/Example.jpg",mime:"image/jpeg",extmetadata:{LicenseShortName:{value:"CC0"},Artist:{value:"Example"},LicenseUrl:{value:"https://creativecommons.org/publicdomain/zero/1.0/deed.en"}}}]}]}}});
  });
  await page.route("https://upload.wikimedia.org/**",r=>r.fulfill({path:"public/icons/icon-192.png",contentType:"image/png"}));
  await page.goto("/demo?view=purchases");
  await page.getByLabel("영수증 상품명",{exact:true}).fill("가상 와인");
  await expect(page.getByText("이름이 일치하는 와인을 연결했습니다.")).toBeVisible();
  await page.locator("summary").filter({hasText:"와인 병 사진"}).click();
  await page.getByRole("button",{name:"공개 병 사진 찾기"}).click();
  await page.getByRole("button",{name:"이 사진 선택"}).click();
  await expect(page.getByAltText("와인 병 사진 미리보기")).toHaveAttribute("src",/^https:/);
  await page.getByLabel("병 사진 촬영").setInputFiles("public/icons/icon-192.png");
  await expect(page.getByAltText("와인 병 사진 미리보기")).toHaveAttribute("src",/^blob:/);
});
