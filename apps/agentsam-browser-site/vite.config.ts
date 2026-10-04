import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);

export default defineConfig({
  root,
  base: './',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 4180, strictPort: true, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4180, strictPort: true, allowedHosts: true },
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true },
});
