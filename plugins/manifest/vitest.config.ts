import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  esbuild: { jsx: "automatic" },
  test: { globals: true, include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"], setupFiles: ["tests/setup.ts"], testTimeout: 20000 },
});
