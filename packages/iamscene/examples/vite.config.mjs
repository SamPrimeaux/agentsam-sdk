import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const themeScenesEntry = fileURLToPath(new URL('../../theme-scenes/src/index.js', import.meta.url));

export default {
  resolve: { alias: { '@inneranimalmedia/theme-scenes': themeScenesEntry } },
  server: {
    host: '127.0.0.1', port: 4175, strictPort: true,
    fs: { allow: [repoRoot] },
  },
  plugins: [{
    name: 'iam-native-preview-root',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === '/' || request.url === '/index.html') {
          response.writeHead(302, { Location: '/original-circuit-hover/' });
          response.end();
        } else next();
      });
    },
  }],
};
