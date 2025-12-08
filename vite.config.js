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
  // Serve docs folder as public directory for sample files and images
  publicDir: "public",
  server: {
    fs: {
      // Allow serving files from docs directory
      allow: [".", "docs"],
    },
  },
});
