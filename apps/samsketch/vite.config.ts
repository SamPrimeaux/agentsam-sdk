import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "/",
  // IAMScene is source-linked in the SDK workspace. Resolve its Ajv import
  // against the consuming app so an isolated SamSketch install can bundle it.
  resolve: {
    alias: { ajv: fileURLToPath(new URL("./node_modules/ajv", import.meta.url)) },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
  server: {
    host: "127.0.0.1",
    port: 4340,
    strictPort: true,
  },
});
