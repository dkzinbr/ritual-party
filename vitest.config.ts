import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    // Each test file gets its own module graph, so store state never leaks between files.
    isolate: true,
    restoreMocks: true,
  },
});
