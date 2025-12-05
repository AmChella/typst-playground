import { defineConfig } from "vite";

export default defineConfig({
  optimizeDeps: {
    exclude: ["@myriaddreamin/typst-ts-web-compiler"],
  },
  worker: {
    format: "es",
  },
  build: {
    target: "esnext",
  },
});
