import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../lib/auth", async (original) => ({
  ...(await original<typeof import("../lib/auth")>()),
  requireUser: vi.fn(),
}));
vi.mock("../lib/supabase/admin", () => ({ adminClient: vi.fn() }));
vi.mock("../lib/analysis/gemini", () => ({
  geminiConfig: vi.fn(),
  analyzeWithGemini: vi.fn(),
}));
import { requireUser, AppError } from "../lib/auth";
import { adminClient } from "../lib/supabase/admin";
import { analyzeWithGemini } from "../lib/analysis/gemini";
import { handleAnalysis } from "../lib/analysis/handler";
const rate = vi.fn();
function req(
  options: {
    consent?: boolean;
    mime?: string;
    bytes?: Buffer;
    origin?: string;
  } = {},
) {
  const form = new FormData();
  form.set(
    "file",
    new File(
      [
        new Uint8Array(
          options.bytes ?? readFileSync("public/icons/icon-192.png"),
        ),
      ],
      "fixture.png",
      { type: options.mime ?? "image/png" },
    ),
  );
  if (options.consent !== false) form.set("consent", "true");
  return new Request("http://localhost:3000/api/analysis/receipt", {
    method: "POST",
    headers: { origin: options.origin ?? "http://localhost:3000" },
    body: form,
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.mocked(requireUser).mockResolvedValue({
    user: { id: "owner-a" },
  } as Awaited<ReturnType<typeof requireUser>>);
  vi.mocked(adminClient).mockReturnValue({ rpc: rate } as unknown as ReturnType<
    typeof adminClient
  >);
  rate.mockResolvedValue({ data: true, error: null });
  vi.mocked(analyzeWithGemini).mockResolvedValue({
    task: "receipt",
    analysis: {},
  } as Awaited<ReturnType<typeof analyzeWithGemini>>);
});
it.each([401, 403])(
  "denies status %i before any image decoding, rate or Google call",
  async (status) => {
    vi.mocked(requireUser).mockRejectedValue(new AppError(status, "denied"));
    const res = await handleAnalysis(req(), "receipt");
    expect(res.status).toBe(status);
    expect(rate).not.toHaveBeenCalled();
    expect(analyzeWithGemini).not.toHaveBeenCalled();
    expect(res.headers.get("cache-control")).toContain("no-store");
  },
);
it("denies cross-origin, absent consent, forged MIME and oversize files before Google", async () => {
  for (const options of [
    { origin: "https://evil.test" },
    { consent: false },
    { mime: "image/jpeg" },
    { bytes: Buffer.alloc(3 * 1024 * 1024 + 1) },
  ])
    expect((await handleAnalysis(req(options), "receipt")).ok).toBe(false);
  expect(analyzeWithGemini).not.toHaveBeenCalled();
});
it("fails closed on shared quota denial or DB errors", async () => {
  rate.mockResolvedValueOnce({ data: false, error: null });
  expect((await handleAnalysis(req(), "receipt")).status).toBe(429);
  rate.mockResolvedValueOnce({
    data: null,
    error: { message: "private db error" },
  });
  expect((await handleAnalysis(req(), "receipt")).status).toBe(503);
  expect(analyzeWithGemini).not.toHaveBeenCalled();
});
it("sanitizes the image and consumes owner/project quotas before analyzing without content writes", async () => {
  const res = await handleAnalysis(req(), "receipt");
  expect(res.status).toBe(200);
  expect(rate).toHaveBeenCalledTimes(4);
  expect(rate.mock.calls[0][1]).toMatchObject({
    bucket: "analysis:minute:user:owner-a",
  });
  expect(rate.mock.calls[3][1]).toMatchObject({
    bucket: "analysis:day:project",
  });
  expect(analyzeWithGemini).toHaveBeenCalledWith(
    "receipt",
    expect.any(Buffer),
    expect.any(AbortSignal),
  );
  expect(res.headers.get("cache-control")).toContain("no-store");
});
