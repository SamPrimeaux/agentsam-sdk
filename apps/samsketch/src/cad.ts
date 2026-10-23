/* The host resolves the OpenCascade.js/WASM asset. Shared geometry operations live in agentsam-occt. */
import wasmUrl from 'opencascade.js/dist/opencascade.full.wasm?url';
import { createOcctBrowserProvider, type CadParameters } from '@inneranimalmedia/agentsam-occt/browser';

const browserOcct = createOcctBrowserProvider({ loadEngine: async () => {
  const module = await import('opencascade.js/dist/opencascade.full.js');
  return module.default({
    locateFile: (name: string) => name.endsWith('.wasm') ? wasmUrl : name,
  });
} });

export const createBooleanGLB = browserOcct.createBooleanGLB;
export type { CadParameters };
