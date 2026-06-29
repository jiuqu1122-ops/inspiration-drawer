import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    outDir: "dist-generator",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        licenseGenerator: resolve(__dirname, "license-generator.html"),
      },
    },
  },
});
