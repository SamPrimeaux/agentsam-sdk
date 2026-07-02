/**
 * Copy Gorilla Mode pixel UI into scaffolded projects (fully local).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_FILES = ['App.tsx', 'main.jsx', 'index.html'];
const ROOT_FILES = ['vite.config.js'];

export function resolveGorillaTemplateDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'templates', 'gorilla-shell');
}

/**
 * @param {string} projectRoot
 * @param {{ projectName: string, laneKey: string, agent: string, laneLabel: string }} meta
 */
export function copyGorillaTemplate(projectRoot, meta) {
  const srcDir = resolveGorillaTemplateDir();
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Gorilla template not found at ${srcDir}`);
  }

  const destDir = path.join(path.resolve(projectRoot), 'gorilla');
  fs.mkdirSync(destDir, { recursive: true });

  const vars = {
    '{{PROJECT_NAME}}': meta.projectName,
    '{{LANE_KEY}}': meta.laneKey,
    '{{LANE_LABEL}}': meta.laneLabel,
    '{{AGENT}}': meta.agent,
  };

  for (const name of TEMPLATE_FILES) {
    const src = path.join(srcDir, name);
    if (!fs.existsSync(src)) continue;
    let content = fs.readFileSync(src, 'utf8');
    for (const [token, value] of Object.entries(vars)) {
      content = content.split(token).join(value);
    }
    fs.writeFileSync(path.join(destDir, name), content, 'utf8');
  }

  const root = path.resolve(projectRoot);
  for (const name of ROOT_FILES) {
    const src = path.join(srcDir, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(root, name));
  }

  return destDir;
}
