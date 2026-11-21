import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { analyzeWithGemini, servingSchema } from "../lib/analysis/gemini";
import {
  wineFixture,
  receiptFixture,
  receiptDetailsFixture,
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
