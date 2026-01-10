import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      enabled: true,
      provider: "v8",
      reporter: ["text", "html"],
      include: ["guest-js/**/*.ts"],
      exclude: ["**/*.d.ts", "dist-js/**", "examples/**", "guest-js/index.ts"],
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90,
    },
  },
});
