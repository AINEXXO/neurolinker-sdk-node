import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // E2E can take longer than unit tests
    testTimeout: Number(process.env.NEUROLINKER_E2E_TIMEOUT_S || 600) * 1000,
  },
});