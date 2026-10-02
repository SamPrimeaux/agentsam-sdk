import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5181,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@inneranimalmedia/agentsam-loading-scene/react": path.resolve(
        __dirname,
        "../../packages/agentsam-loading-scene/src/react/index.ts",
      ),
      "@inneranimalmedia/agentsam-loading-scene": path.resolve(
        __dirname,
        "../../packages/agentsam-loading-scene/src/index.ts",
      ),
    },
  },
});
