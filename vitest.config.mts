import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    // Specs only: *.test.ts still run under node:test via npm run test:unit.
    include: ["src/**/*.spec.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    restoreMocks: true,
  },
});
