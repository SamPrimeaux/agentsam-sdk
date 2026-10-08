import fs from 'node:fs';
const contract = JSON.parse(fs.readFileSync(new URL('./contract.v1.json', import.meta.url), 'utf8'));
export const QUALITY_VIEWPORTS = Object.freeze(contract.viewports.map((row) => Object.freeze(row)));
export const BOUNDARY_VIEWPORTS = Object.freeze(contract.boundary_viewports.map((row) => Object.freeze(row)));
export const VIEWPORT_RANGES = Object.freeze(contract.viewport_ranges.map((row) => Object.freeze(row)));
