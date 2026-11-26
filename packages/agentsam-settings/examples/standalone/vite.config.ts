import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const previewRoot = fileURLToPath(new URL('.', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));

export default defineConfig({
  root: previewRoot,
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    fs: { allow: [repositoryRoot] },
  },
  build: { outDir: fileURLToPath(new URL('../../../../.cache/agentsam-settings-preview', import.meta.url)), emptyOutDir: true },
});
