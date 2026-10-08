import fs from 'node:fs';
const contract = JSON.parse(fs.readFileSync(new URL('./contract.v1.json', import.meta.url), 'utf8'));
export const QUALITY_VIEWPORTS = Object.freeze(contract.viewports.map((row) => Object.freeze(row)));
