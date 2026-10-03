import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Local file packages are symlinked into this app. Keep their logical
    // node_modules location so peer dependencies resolve to the app runtime.
    preserveSymlinks: true,
    dedupe: ["react", "react-dom"],
  },
  // Hashed bundles live here; public routes are /admin/analytics/* (Worker SPA fallback)
  base: "/admin/_spa/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/admin/css": "http://localhost:8787",
      "/admin/analytics/assets": "http://localhost:8787",
    },
  },
});
