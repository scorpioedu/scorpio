const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/tests/security/", "/.firebase/"],
  modulePathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/.next-gate/"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};