import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
  },
  define: {
    // node:crypto shim not needed in browser; machine pass uses it only server-side.
  },
  resolve: {
    alias: {
      "node:crypto": "/src/crypto-shim.ts",
    },
  },
});
