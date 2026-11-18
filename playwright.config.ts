import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  projects: [
    {
      name: "mobile-360",
      testIgnore: /configuration.spec.ts/,
      use: { viewport: { width: 360, height: 800 } },
    },
    {
      name: "mobile-390",
      testIgnore: /configuration.spec.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: "tablet",
      testIgnore: /configuration.spec.ts/,
      use: { viewport: { width: 768, height: 1024 } },
    },
    {
      name: "desktop",
      testIgnore: /configuration.spec.ts/,
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "unconfigured-preview",
      testMatch: /configuration.spec.ts/,
      use: {
        baseURL: "http://127.0.0.1:3101",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: [
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3101",
      url: "http://127.0.0.1:3101/setup",
      reuseExistingServer: false,
      timeout: 60000,
      env: {
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3101",
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
        GEMINI_ANALYSIS_ENABLED: "false",
        VERCEL_ENV: "preview",
      },
    },
    {
      command: "npx tsx tests/support/supabase-fixture.ts",
      url: "http://127.0.0.1:54399/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run start -- --hostname 127.0.0.1 --port 3100",
      url: "http://127.0.0.1:3100/login",
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-only",
        SUPABASE_SECRET_KEY: "local-test-secret",
        GEMINI_ANALYSIS_ENABLED: "false",
      },
      timeout: 60000,
    },
  ],
});
