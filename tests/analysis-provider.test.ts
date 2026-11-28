import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { analyzeWithGemini, servingSchema } from "../lib/analysis/gemini";
import type { CollectionWine } from "../lib/analysis/collection-matching";
import {
  wineFixture,
  receiptFixture,
  receiptDetailsFixture,
  winePhotoFixture,
} from "./fixtures/analysis";
const response = () =>
  Response.json({
    candidates: [
      {
        finishReason: "STOP",
        content: { parts: [{ text: JSON.stringify(wineFixture) }] },
      },
    ],
  });
beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-only-not-a-real-secret");
  vi.stubEnv("GEMINI_ANALYSIS_ENABLED", "true");
  vi.stubEnv("GEMINI_MODEL", "gemini-3.1-flash-lite");
});
it("uses the multi-bottle photo contract without receipt facts and validates the result", async () => {
  const analysis = structuredClone(winePhotoFixture);
  analysis.bottles[0].source_photo = 1;
  analysis.bottles[0].bottle_box = [125, 200, 800, 550];
  analysis.bottles[1].source_photo = 2;
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(analysis) }] },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await analyzeWithGemini(
    "wine-photo",
    [Buffer.from("first"), Buffer.from("second")],
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    task: "wine-photo",
    schema_version: "2.0",
    analysis: {
      bottle_count: 2,
      bottles: [
        { source_photo: 1, bottle_box: [125, 200, 800, 550] },
        { source_photo: 2 },
      ],
    },
  });
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.contents[0].parts.slice(2)).toEqual([
    { text: "사진 1" },
    { inlineData: { mimeType: "image/webp", data: "Zmlyc3Q=" } },
    { text: "사진 2" },
    { inlineData: { mimeType: "image/webp", data: "c2Vjb25k" } },
  ]);
  expect(body.generationConfig.maxOutputTokens).toBe(16000);
  const properties = body.generationConfig.responseJsonSchema.properties;
  expect(properties.bottles).toBeDefined();
  for (const field of [
    "merchant",
    "purchased_on",
    "paid_amount",
    "discount_amount",
  ])
    expect(properties[field]).toBeUndefined();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("sends bytes and a small schema to Google only, keeps keys in headers and validates the response", async () => {
  const fetcher = vi.fn().mockResolvedValue(response());
  vi.stubGlobal("fetch", fetcher);
  const result = await analyzeWithGemini(
    "wine-label",
    Buffer.from("fixture"),
    new AbortController().signal,
  );
  const [url, options] = fetcher.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
  );
  expect(options.headers["x-goog-api-key"]).toBe("test-only-not-a-real-secret");
  expect(options.body).not.toContain("test-only-not-a-real-secret");
  expect(options.cache).toBe("no-store");
  expect(options.redirect).toBe("error");
  expect(result).toMatchObject({
    schema_version: "2.0",
    task: "wine-label",
    analysis: { wine: { name: "Example Blanc" } },
  });
  expect(JSON.stringify(servingSchema("receipt"))).not.toContain('"maximum"');
});
it("retries a transient 503 once but never falls back to a paid model", async () => {
  const f = vi
    .fn()
    .mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValue(response());
  vi.stubGlobal("fetch", f);
  await analyzeWithGemini(
    "wine-label",
    Buffer.from("x"),
    new AbortController().signal,
  );
  expect(f).toHaveBeenCalledTimes(2);
  expect(f.mock.calls[0][0]).toBe(f.mock.calls[1][0]);
});

it("requests and returns receipt v3 product details while retaining raw labels and prices", async () => {
  const receipt = structuredClone(receiptFixture);
  receipt.lines[1].wines[0].details = structuredClone(receiptDetailsFixture);
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: JSON.stringify(receipt) }] },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await analyzeWithGemini(
    "receipt",
    Buffer.from("fixture"),
    new AbortController().signal,
  );
  expect(result).toMatchObject({
    schema_version: "3.0",
    task: "receipt",
    analysis: receipt,
  });
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(
    body.generationConfig.responseJsonSchema.properties.lines.items.properties
      .wines.items.properties.details,
  ).toBeDefined();
});

it("does not require vintage_label in either Gemini request schema", () => {
  const receipt = JSON.parse(JSON.stringify(servingSchema("receipt")));
  const bottle = receipt.properties.lines.items.properties.wines.items;
  expect(bottle.required).not.toContain("vintage_label");
  expect(
    bottle.properties.details.anyOf[0].properties.summary_ko,
  ).toBeDefined();
  const label = JSON.parse(JSON.stringify(servingSchema("wine-label")));
  expect(label.properties.wine.anyOf[0].required).not.toContain(
    "vintage_label",
  );
  expect(label.properties.wine.anyOf[0].properties.summary_ko).toBeDefined();
});

it("sends the complete collection as data and resolves only request-local references for each receipt wine", async () => {
  const wines: CollectionWine[] = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      name_ko: "내 소비뇽 블랑",
      name_original: "My Sauvignon Blanc",
      producer: "My Estate",
      wine_type: "white",
      country: "NZ",
      region: "Marlborough",
      grape: "Sauvignon Blanc",
    },
  ];
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ...receiptFixture,
                  collection_matches: [
                    {
                      line_index: 0,
                      wine_index: 1,
                      collection_ref: 1,
                      confidence: "medium",
                      reason: "세트 두 번째 와인의 약칭이 일치합니다.",
                    },
                    {
                      line_index: 1,
                      wine_index: 0,
                      collection_ref: 100,
                      confidence: "high",
                      reason: "잘못된 참조",
                    },
                  ],
                }),
              },
            ],
          },
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await analyzeWithGemini(
    "receipt",
    Buffer.from("fixture"),
    new AbortController().signal,
    wines,
  );
  expect(result.analysis).toEqual(receiptFixture);
  expect(result.collection_matches).toEqual([
    {
      line_index: 0,
      wine_index: 1,
      wine_id: wines[0].id,
      confidence: "medium",
      reason: "세트 두 번째 와인의 약칭이 일치합니다.",
    },
  ]);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.tools).toBeUndefined();
  expect(body.contents[0].parts[1].text).toContain(
    '"name_original":"My Sauvignon Blanc"',
  );
  expect(body.contents[0].parts[1].text).not.toContain(wines[0].id);
  expect(
    body.generationConfig.responseJsonSchema.properties.collection_matches,
  ).toBeDefined();
});
it.each([400, 401, 404, 429])(
  "does not repeat HTTP %i or echo upstream credentials",
  async (status) => {
    const f = vi
      .fn()
      .mockResolvedValue(
        new Response("test-only-not-a-real-secret", { status }),
      );
    vi.stubGlobal("fetch", f);
    await expect(
      analyzeWithGemini(
        "wine-label",
        Buffer.from("x"),
        new AbortController().signal,
      ),
    ).rejects.not.toThrow("test-only-not-a-real-secret");
    expect(f).toHaveBeenCalledTimes(1);
  },
);
it("rejects truncated/malformed output and missing configuration", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
      ),
  );
  await expect(
    analyzeWithGemini(
      "receipt",
      Buffer.from("x"),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 502 });
  vi.stubEnv("GEMINI_API_KEY", "");
  await expect(
    analyzeWithGemini(
      "receipt",
      Buffer.from("x"),
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ status: 503 });
});
