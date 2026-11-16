const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFiles: ["<rootDir>/jest.env.cjs"],
  testPathIgnorePatterns: ["/node_modules/", "/tests/security/", "/.firebase/", "/.claude/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/.next-gate/", "<rootDir>/.claude/"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};