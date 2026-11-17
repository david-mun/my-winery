import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({ getAll: () => [], set: vi.fn() })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error("REDIRECT:" + path);
  }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    },
  })),
}));
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  hasSupabaseConfiguration,
  ServiceConfigurationError,
} from "../lib/env";
import { supabase } from "../lib/supabase/server";
import { adminClient } from "../lib/supabase/admin";
import { pageUser, requireUser } from "../lib/auth";
import { fail } from "../lib/http";
import { GET as callback } from "../app/auth/callback/route";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
it("fails before cookies or a Supabase client/network call when URL/key is missing", async () => {
  expect(hasSupabaseConfiguration()).toBe(false);
  await expect(supabase()).rejects.toBeInstanceOf(ServiceConfigurationError);
  await expect(requireUser()).rejects.toBeInstanceOf(ServiceConfigurationError);
  expect(cookies).not.toHaveBeenCalled();
  expect(createServerClient).not.toHaveBeenCalled();
});
it("redirects private pages to setup and keeps APIs at explicit 503", async () => {
  await expect(pageUser()).rejects.toThrow("REDIRECT:/setup");
  const response = fail(new ServiceConfigurationError());
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toContain("no-store");
  const text = await response.text();
  expect(text).toContain("서비스 연결 설정");
  expect(text).not.toContain("SERVICE_NOT_CONFIGURED");
});
it("retains the normal login redirect once public connection settings exist", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54399");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  expect(hasSupabaseConfiguration()).toBe(true);
  await expect(pageUser()).rejects.toThrow("REDIRECT:/login");
  expect(createServerClient).toHaveBeenCalledOnce();
  expect(() => adminClient()).toThrow(ServiceConfigurationError);
});
it("drops callback credentials and stays on the requested deployment when unconfigured", async () => {
  const response = await callback(
    new Request(
      "https://preview.example.test/auth/callback?code=do-not-forward&next=https://evil.test",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://preview.example.test/setup",
  );
  expect(createServerClient).not.toHaveBeenCalled();
});
it("treats empty/whitespace configuration as absent", () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", " ");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", " ");
  expect(hasSupabaseConfiguration()).toBe(false);
});
