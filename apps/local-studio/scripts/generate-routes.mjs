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

// TanStack Start adds this type-only registration in its hosted build.
// Keep it in the checked-in canonical route tree so desktop route generation
// does not remove hosted SSR typing on every clean installation.
const file = resolve(root, 'frontend/src/routeTree.gen.ts');
const registration = [
  "import type { getRouter } from './router.tsx'",
  "import type { createStart } from '@tanstack/react-start'",
  "declare module '@tanstack/react-start' {",
  '  interface Register {',
  '    ssr: true',
  '    router: Awaited<ReturnType<typeof getRouter>>',
  '  }',
  '}',
].join('\n');
const generated = readFileSync(file, 'utf8');
if (!generated.includes("declare module '@tanstack/react-start'")) {
  writeFileSync(file, generated.trimEnd() + '\n\n' + registration + '\n');
}
console.log('[routes] generated canonical Local Studio route tree');
