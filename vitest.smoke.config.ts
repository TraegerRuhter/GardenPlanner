/** Network smoke tests (real Open-Meteo calls), kept out of `npm test`.
 *  Run: npx vitest run --config vitest.smoke.config.ts */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts"],
    environment: "node",
  },
});
