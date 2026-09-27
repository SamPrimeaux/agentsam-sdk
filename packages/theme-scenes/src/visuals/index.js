/**
 * Visual primitives — not scenes. Plugged into hero / stage slots.
 */

export const VISUAL_KINDS = Object.freeze({
  'visual.orbital-field': {
    id: 'visual.orbital-field',
    label: 'Orbital Field',
    description: 'Three.js (or WebGL) globe / lattice; scroll can scrub rotation.',
    runtime: 'webgl',
    props: ['tone', 'intensity', 'scrub'],
  },
  'visual.atmosphere': {
    id: 'visual.atmosphere',
    label: 'Atmosphere Layer',
    description: 'Galaxy / stars / soft gradient bleed — optional underlay.',
    runtime: 'css',
    props: ['density', 'tone'],
  },
  'visual.grid-field': {
    id: 'visual.grid-field',
    label: 'Grid Field',
    description: 'Quiet structural grid for editorial surfaces.',
    runtime: 'css',
  },
  'visual.product-window': {
    id: 'visual.product-window',
    label: 'Product Window Frame',
    description: 'Chrome frame around a DemoHost — not a fake IDE.',
    runtime: 'dom',
    props: ['title', 'chrome'],
  },
});

export function getVisual(id) {
  return VISUAL_KINDS[id] || null;
}

export function listVisuals() {
  return Object.values(VISUAL_KINDS);
}
