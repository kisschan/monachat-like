import { defineWorkspace } from "vitest/config";

const runBrowserProject = process.argv.some(
  (arg) => arg === "--browser" || arg.startsWith("--browser.") || arg === "--project=browser",
);

const unitProject = {
  extends: "vite.config.ts",
  test: {
    name: "unit",
  },
};

const browserProject = {
  extends: "vite.config.ts",
  test: {
    name: "browser",
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      providerOptions: {},
    },
  },
};

export default defineWorkspace([unitProject, ...(runBrowserProject ? [browserProject] : [])]);
