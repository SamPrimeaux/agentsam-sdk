/** Generate the same TanStack file-route tree for hosted and downloadable Studio.
 * Desktop Vite does not run tanstackStart, so without this step new app routes
 * silently build but render 404 in packaged Tauri. Keep one canonical route file set.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getConfig, Generator } from '@tanstack/router-generator';
const root = resolve(import.meta.dirname, '..');
const config = getConfig({
  target: 'react',
  routesDirectory: './frontend/src/routes',
  generatedRouteTree: './frontend/src/routeTree.gen.ts',
  routeFileIgnorePattern: '^_app(?:\\.tsx)?$',
}, root);
await new Generator({ config, root }).run();
console.log('[routes] generated canonical Local Studio route tree');
