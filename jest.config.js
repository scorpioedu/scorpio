/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.env.cjs"],
  // src/lib/content/spec.ts is the problem-spec module, not a test, though its name matches jest's "spec" pattern.
  testPathIgnorePatterns: [
    "/node_modules/",
    "/tests/security/",
    "/.firebase/",
    "/.claude/",
    "/src/lib/content/spec\\.ts$",
  ],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/.next-gate/", "<rootDir>/.claude/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    // Animated icons ship as ESM-only subpaths; tests get a still stand-in.
    "^@animateicons/react/lucide/.+$": "<rootDir>/__mocks__/animated-icon.cjs",
  },
};
