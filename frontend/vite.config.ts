/// <reference types="vitest" />

import { defineConfig } from "vite";
import path from "path";
import vue from "@vitejs/plugin-vue";
import cssInjectedByJsPlugin from "vite-plugin-css-injected-by-js";
import Unfonts from "unplugin-fonts/vite";
import vueDevTools from "vite-plugin-vue-devtools";

export default defineConfig(({ mode }) => {
  // vitest 実行時は mode が "test" になったり process.env.VITEST が立つ前提で分岐する
  const isVitest = process.env.VITEST === "true" || mode === "test";

  // vitest のUI / browser 実行を雑に検出（確実性を上げたいなら scripts 側で環境変数を立てる）
  const argv = process.argv.join(" ");
  const isUI = argv.includes("--ui");
  const isBrowser = argv.includes("--browser");

  // coverage は「通常OFF」。必要時のみ環境変数でON（UI/browserでは強制OFF）
  const enableCoverage = process.env.VITEST_COVERAGE === "1" && !isUI && !isBrowser;

  return {
    build: {
      outDir: "../backend/src/dist",
    },
    css: {
      devSourcemap: true,
    },
    plugins: [
      vue(),
      cssInjectedByJsPlugin(),
      Unfonts({
        google: {
          families: ["Noto Sans JP"],
        },
      }),
      vueDevTools(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
    },

    // ★重要：Vitest 実行時は dev server の port 固定を外す（UI/browser 経路の事故率を下げる）
    server: isVitest
      ? {
          // テスト時は指定しない（デフォルトに任せる）
          watch: { usePolling: true },
        }
      : {
          port: 2108,
          watch: { usePolling: true },
        },

    test: {
      coverage: enableCoverage
        ? {
            enabled: true,
            provider: "istanbul",
          }
        : {
            enabled: false,
            provider: "istanbul",
          },
      environment: "happy-dom",
      globals: true,
      include: ["test/**/*.spec.ts"],
    },
  };
});
