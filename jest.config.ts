import type { Config } from "jest";

const config: Config = {
  projects: [
    {
      displayName: "server",
      testEnvironment: "node",
      testMatch: ["<rootDir>/tests/server/**/*.test.ts"],
      transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }]
      }
    },
    {
      displayName: "client",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/tests/client/**/*.test.ts"],
      transform: {
        "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }]
      }
    }
  ]
};

export default config;
