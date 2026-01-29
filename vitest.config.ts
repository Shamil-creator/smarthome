import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["tests/frontend/**/*.test.ts", "tests/frontend/**/*.test.tsx"],
  },
});
