/**
 * Init / create pickers — real presets, scaffolds, and apps (not aspirational lanes).
 */
import { listPresets } from '../presets/index.js';
import { listAppManifests } from '../commands/app.js';

export const SCAFFOLD_WIZARDS = Object.freeze([
  {
    value: 'scaffold:cms',
    kind: 'scaffold',
    scaffold: 'cms',
    label: 'CMS Site (Worker + D1 + R2)',
    hint: 'Proven Cloudflare CMS scaffold with pages, nav, and templates',
  },
  {
    value: 'scaffold:worker-api',
    kind: 'scaffold',
    scaffold: 'worker-api',
    label: 'Worker API',
    hint: 'Bare Cloudflare Worker with typed routes and D1',
  },
]);

export const RUN_TARGET_OPTIONS = Object.freeze([
  {
    value: 'local',
    label: 'This machine',
    hint: 'SQLite + local API; no cloud account required',
  },
  {
    value: 'cloudflare',
    label: 'Cloudflare Workers',
    hint: 'OAuth via Local Studio / agentsam connections — Workers, D1, R2',
  },
  {
    value: 'gcp',
    label: 'Google Cloud',
    hint: 'agentsam google-cloud OAuth / gcloud — VMs, Cloud Run, Workstations',
  },
  {
    value: 'docker',
    label: 'Docker',
    hint: 'agentsam dockerize — proven compose/build/run on this host',
  },
]);

function appReady(manifest = {}) {
  const runtime = manifest.runtime || {};
  return (
    runtime.source_scaffold === 'ready'
    || runtime.local_preview === 'ready'
    || runtime.cloudflare === 'ready'
  );
}

export function listInitProjectTypeOptions(root) {
  const presets = listPresets().map((preset) => ({
    value: `preset:${preset.id}`,
    kind: 'preset',
    presetId: preset.id,
    lane: preset.lane || preset.id,
    label: preset.id === 'cms' ? 'CMS app (local AgentSam)' : preset.id === 'prototype'
      ? 'Prototype (minimal)'
      : preset.id === 'data'
        ? 'Data app'
        : 'Full Stack app',
    hint: preset.description || preset.id,
  }));

  const apps = listAppManifests(root)
    .filter((row) => appReady(row.manifest || {}))
    .map((row) => {
      const runtime = row.manifest?.runtime || {};
      const cf = runtime.cloudflare === 'ready' ? ' · Cloudflare ready' : '';
      return {
        value: `app:${row.id}`,
        kind: 'app',
        appId: row.id,
        label: row.name || row.id,
        hint: `agentsam app scaffold ${row.id}${cf}`,
        hasScaffold: Boolean(row.commands?.scaffold || row.manifest?.commands?.scaffold),
      };
    });

  return [...presets, ...SCAFFOLD_WIZARDS, ...apps];
}

export function parseProjectTypeChoice(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('preset:')) {
    return { kind: 'preset', id: raw.slice('preset:'.length) };
  }
  if (raw.startsWith('scaffold:')) {
    return { kind: 'scaffold', id: raw.slice('scaffold:'.length) };
  }
  if (raw.startsWith('app:')) {
    return { kind: 'app', id: raw.slice('app:'.length) };
  }
  // Back-compat for --lane fullstack|cms|…
  if (raw) return { kind: 'preset', id: raw };
  return null;
}

/** Concrete next commands after init — not "decide later". */
export function guidanceForRunTarget(runTarget, { projectName } = {}) {
  const name = projectName || '.';
  if (runTarget === 'cloudflare') {
    return [
      'agentsam connections setup          # Cloudflare OAuth callback + Local Studio connector',
      'agentsam cloudflare                 # Workers / bindings capabilities',
      `cd ${name} && npm run deploy        # Graduate this project to a Worker when ready`,
    ];
  }
  if (runTarget === 'gcp') {
    return [
      'agentsam google-cloud doctor        # OAuth + gcloud readiness',
      'agentsam google-cloud auth          # Sign in / refresh Google user OAuth',
      'agentsam compute                   # List VMs / Cloud Run / Workstations targets',
    ];
  }
  if (runTarget === 'docker') {
    return [
      `cd ${name} && npx agentsam dockerize   # Generate Dockerfile + compose from proven templates`,
      'docker compose up --build',
    ];
  }
  return [
    'npm install && npm run smoke && npm run dev',
    'npx agentsam',
    'Optional: npm run pty · npm run ollama:setup',
  ];
}
