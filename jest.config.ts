import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["@testing-library/jest-dom"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@vercel/kv$": "<rootDir>/src/__mocks__/@vercel/kv.ts",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.{ts,tsx}", "**/*.test.{ts,tsx}"],
  // Stale git worktrees under .claude/ carry duplicate src trees and __mocks__,
  // which collide in jest-haste-map. Keep them out of the test/module graph.
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/.claude/"],
};

export default config;
