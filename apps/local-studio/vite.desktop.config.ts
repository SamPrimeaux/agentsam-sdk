import { resolve } from "node:path";
import { defineConfig, type UserConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import baseExport from "./vite.config.ts";

const studioRoot = resolve(import.meta.dirname);
const baseFactory = baseExport as unknown as (env: Record<string, unknown>) => UserConfig;
const shared = baseFactory({ command: "build", mode: "production", isPreview: false });

export default defineConfig({
  root: resolve(studioRoot, "frontend/desktop"),
  base: "./",
  publicDir: resolve(studioRoot, "frontend/public"),
  resolve: shared.resolve,
  plugins: [tailwindcss(), viteReact()],
  build: {
    ...(shared.build || {}),
    outDir: resolve(studioRoot, "desktop-dist"),
    emptyOutDir: true,
  },
});
