/// <reference types="vitest" />

import { defineConfig } from "vite";
import path from "path";
import vue from "@vitejs/plugin-vue";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import Unfonts from "unplugin-fonts/vite";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig(({}) => {
  const argv = process.argv.join(" ");
  const isUI = argv.includes("--ui");
  const isBrowser = argv.includes("--browser");
  const enableCoverage = process.env.VITEST_COVERAGE === "1" && !isUI && !isBrowser;

  return {
    build: { outDir: "../backend/src/dist" },
    css: { devSourcemap: true },
    plugins: [
      vue(),
      cssInjectedByJsPlugin(),
      Unfonts({ google: { families: ["Noto Sans JP"] } }),
      vueDevTools(),
    ],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
    },

    test: {
      browser: { enabled: isBrowser },
      ui: { enabled: isUI },
      coverage: enableCoverage ? { enabled: true, provider: "istanbul" } : { enabled: false },

      environment: "happy-dom",
      globals: true,
      include: ["test/**/*.spec.ts"],
    },
  };
});
