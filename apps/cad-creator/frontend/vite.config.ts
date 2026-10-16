import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Local preview uses the same path as the production Worker. Vite proxies
      // the public R2 model bytes server-side, so browser CORS is not required.
      proxy: {
        '/cad-creator/assets/chess/baroque/': {
          target: 'https://assets.inneranimalmedia.com',
          changeOrigin: true,
          secure: true,
          rewrite: (url: string) => url.replace(
            '/cad-creator/assets/chess/baroque/', '/glb/chess/baroque/'
          ),
        },
      },
    },
  };
});
