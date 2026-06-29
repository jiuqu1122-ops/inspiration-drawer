import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { existsSync, rmSync } from "node:fs";

const modelPublicDir = resolve(__dirname, "public", "models");
const modelDistDir = resolve(__dirname, "dist", "models");
const transformersDistDir = resolve(__dirname, "dist", "transformers");

const excludeBundledLocalModels = () => ({
  name: "exclude-bundled-local-models",
  buildStart() {
    if (existsSync(modelPublicDir)) {
      this.error("不要把本地视觉模型放进 public/models；安装包会在首次使用时按需下载模型。");
    }
  },
  closeBundle() {
    if (existsSync(modelDistDir)) {
      rmSync(modelDistDir, { recursive: true, force: true });
    }
    if (existsSync(transformersDistDir)) {
      rmSync(transformersDistDir, { recursive: true, force: true });
    }
  },
});

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [excludeBundledLocalModels(), react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        note: resolve(__dirname, "note.html"),
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
