import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./artifacts/peopleos/e2e",
  timeout: 45_000,
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: "node --enable-source-maps artifacts/api-server/dist/index.mjs",
      port: 5000,
      reuseExistingServer: true,
      env: {
        PORT: "5000",
        PEOPLEOS_AUTH_MODE: "demo",
      },
    },
    {
      command: "pnpm --filter @workspace/peopleos run dev -- --host 127.0.0.1 --port 5173",
      port: 5173,
      reuseExistingServer: true,
    },
  ],
});
