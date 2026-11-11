import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname);

/**
 * Static client for GitHub Pages. The live preview keeps using vite.config.ts
 * (TanStack Start on port 8080). This build has no Nitro server and no /api/rtc.
 * Solo play is the whole page. Base is the project-pages path under meridian.
 */
export default defineConfig({
  root: resolve(root, "hold-pages"),
  base: "/meridian/hold/play/",
  publicDir: resolve(root, "hold-pages/public"),
  plugins: [tailwindcss(), viteReact()],
  resolve: {
    tsconfigPaths: true,
    alias: { "@": resolve(root, "src") },
  },
  server: {
    fs: { allow: [root] },
  },
  build: {
    outDir: process.env.PAGES_OUT ? resolve(process.env.PAGES_OUT) : resolve(root, "dist-pages"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
