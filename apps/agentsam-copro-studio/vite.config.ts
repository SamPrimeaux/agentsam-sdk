import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const repoUi = fileURLToPath(new URL("../../packages/copro-ui/src/index.ts", import.meta.url));
const repoStyles = fileURLToPath(new URL("../../packages/copro-ui/styles/copro.css", import.meta.url));
const repoStorage = fileURLToPath(new URL("../../packages/copro-storage/src/index.js", import.meta.url));
const repoEditor = fileURLToPath(new URL("../../packages/copro-editor/src/index.js", import.meta.url));
const repoMedia = fileURLToPath(new URL("../../packages/copro-media/src/index.js", import.meta.url));

/**
 * This is the LOCAL development and build resolution, not a localhost runtime
 * dependency. Always consume the current worktree instead of stale installed SDK
 * package copies or an old dist emitted before the last editing pass.
 */
export default defineConfig({
  plugins: [
    react(),
    {
      name: "portable-copro-source-paths",
      apply: "build",
      enforce: "post",
      renderChunk(code) {
        const root = fileURLToPath(
          new URL("../../", import.meta.url)
        ).replaceAll("\\", "/");
        return code.includes(root)
          ? { code: code.replaceAll(root, "sdk:///"), map: null }
          : null;
      },
    },
  ],
  resolve: {
    alias: [
      {find:/^@inneranimalmedia\/copro-ui\/styles\.css$/, replacement:repoStyles},
      {find:/^@inneranimalmedia\/copro-ui$/,replacement:repoUi},
      {find:/^@inneranimalmedia\/copro-storage$/,replacement:repoStorage},
      {find:/^@inneranimalmedia\/copro-editor$/,replacement:repoEditor},
      {find:/^@inneranimalmedia\/copro-media$/,replacement:repoMedia},
    ],
  },
  optimizeDeps: { exclude:["@inneranimalmedia/copro-ui","@inneranimalmedia/copro-storage","@inneranimalmedia/copro-editor","@inneranimalmedia/copro-media"] },
  server: { watch:{usePolling:true,interval:400} },
  build: { target:"esnext" },
});
