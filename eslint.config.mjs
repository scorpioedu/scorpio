import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // CommonJS entry points (Jest config, security tests, admin tools) must use require().
  {
    files: ["**/*.cjs", "jest.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    ".firebase/**",
    "functions/lib/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktrees are not project source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
