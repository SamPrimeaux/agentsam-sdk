import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
    alias: {
      '@inneranimalmedia/agentsam-cms-shared': path.join(root, '../shared/cms/src/index.ts'),
      '@inneranimalmedia/agentsam-cms-backend/api': path.join(root, '../backend/src/api/client.ts'),
      '@inneranimalmedia/agentsam-cms-backend/model': path.join(root, '../backend/src/model.ts'),
      '@inneranimalmedia/agentsam-cms-backend/preview': path.join(root, '../backend/src/preview/bridge.ts'),
      '@inneranimalmedia/agentsam-cms-backend/routing': path.join(root, '../backend/src/routing/index.js'),
      '@inneranimalmedia/agentsam-cms-backend': path.join(root, '../backend/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
