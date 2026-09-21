import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 4174,
  },
  preview: {
    host: '0.0.0.0',
    port: 4174,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
