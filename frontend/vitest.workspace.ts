import { defineWorkspace } from "vitest/config";

const unitProject = {
  extends: "vite.config.ts",
  test: {
    name: "unit",
    exclude: ["**/*.browser.spec.ts"],
    browser: { enabled: false, name: "chromium", provider: "playwright", providerOptions: {} },
    ui: { enabled: false },
  },
};

const browserProject = {
  extends: "vite.config.ts",
  test: {
    name: "browser",
    include: ["**/*.browser.spec.ts"],
    ui: { enabled: false },
    browser: {
      enabled: true,
      name: "chromium",
      provider: "playwright",
      providerOptions: {},
    },
  },
};

const mode = process.env.VITEST_MODE;
const projects = mode === "browser" ? [browserProject] : [unitProject];

export default defineWorkspace(projects);
