/**
 * Persisted Google Cloud connection preference (not ambient gcloud active account).
 * Secrets never stored here — identity/project references only.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SCHEMA = 'agentsam-google-cloud-connection-v1';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function homeDirectory(options = {}) {
  return path.resolve(
    clean(options.home) || clean(options.env?.HOME) || clean(options.env?.USERPROFILE) || os.homedir(),
  );
}

export function googleCloudConnectionPath(options = {}) {
  return path.join(homeDirectory(options), '.agentsam', 'connections', 'google-cloud.json');
}

export function readGoogleCloudConnection(options = {}) {
  const file = googleCloudConnectionPath(options);
  try {
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!raw || typeof raw !== 'object') return null;
    return {
      schema_version: SCHEMA,
      identity: clean(raw.identity) || null,
      organization: clean(raw.organization) || null,
      project: clean(raw.project) || null,
      billing_account: clean(raw.billing_account) || null,
      always_use_for_projects:
        raw.always_use_for_projects && typeof raw.always_use_for_projects === 'object'
          ? { ...raw.always_use_for_projects }
          : {},
      updated_at: clean(raw.updated_at) || null,
    };
  } catch {
    return null;
  }
}

export function writeGoogleCloudConnection(input = {}, options = {}) {
  const file = googleCloudConnectionPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const prev = readGoogleCloudConnection(options) || {};
  const next = {
    schema_version: SCHEMA,
    identity: clean(input.identity) || prev.identity || null,
    organization: clean(input.organization) || prev.organization || null,
    project: clean(input.project) || prev.project || null,
    billing_account: clean(input.billing_account) || prev.billing_account || null,
    always_use_for_projects: {
      ...(prev.always_use_for_projects || {}),
      ...(input.always_use_for_projects || {}),
    },
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

/**
 * Compare preferred connection vs ambient gcloud active account/project.
 */
export function diagnoseGoogleCloudAccountMismatch({
  preferred = null,
  activeAccount = null,
  activeProject = null,
  accounts = [],
} = {}) {
  const preferredIdentity = clean(preferred?.identity);
  const preferredProject = clean(preferred?.project);
  const active = clean(activeAccount);
  const project = clean(activeProject);

  if (!preferredIdentity) {
    return {
      ok: true,
      kind: 'no_preference',
      message: 'No AgentSam Google Cloud connection preference stored yet.',
      hint: 'agentsam google-cloud connection set --identity you@example.com --project PROJECT_ID',
    };
  }

  if (active && preferredIdentity && active.toLowerCase() !== preferredIdentity.toLowerCase()) {
    const alt = (accounts || []).find(
      (row) => clean(row.account).toLowerCase() === preferredIdentity.toLowerCase(),
    );
    return {
      ok: false,
      kind: 'identity_mismatch',
      message: 'Ambient gcloud active account is not the AgentSam connection identity.',
      current_account: active,
      required_identity: preferredIdentity,
      required_project: preferredProject || null,
      alternate_authenticated: Boolean(alt),
      remediation: {
        title: 'This Google account does not match the saved connection.',
        actions: [
          {
            id: 'retry',
            title: `Retry with ${preferredIdentity}`,
            command: `gcloud config set account ${preferredIdentity}`,
            recommended: true,
          },
          {
            id: 'always',
            title: 'Always use preferred identity for this project',
            command: `agentsam google-cloud connection set --identity ${preferredIdentity}${preferredProject ? ` --project ${preferredProject}` : ''}`,
          },
          {
            id: 'login',
            title: 'Login preferred identity',
            command: 'agentsam gcloud auth login',
          },
        ],
      },
    };
  }

  if (preferredProject && project && preferredProject !== project) {
    return {
      ok: false,
      kind: 'project_mismatch',
      message: 'Ambient gcloud project differs from the AgentSam connection project.',
      current_project: project,
      required_project: preferredProject,
      remediation: {
        title: 'Switch to the connection project (or pass --project explicitly).',
        actions: [
          {
            id: 'set_project',
            title: `Use project ${preferredProject}`,
            command: `gcloud config set project ${preferredProject}`,
            recommended: true,
          },
        ],
      },
    };
  }

  return {
    ok: true,
    kind: 'aligned',
    message: 'Ambient gcloud account/project aligns with AgentSam connection preference.',
    identity: preferredIdentity,
    project: preferredProject || project || null,
  };
}

/**
 * Deterministic insufficient-access card when ambient account lacks a required role
 * but another authenticated account has it (e.g. Owner).
 */
export function diagnoseInsufficientAccess({
  currentAccount = null,
  requiredRole = 'roles/owner',
  accounts = [],
  project = null,
} = {}) {
  const current = clean(currentAccount);
  const need = clean(requiredRole) || 'roles/owner';
  const rows = Array.isArray(accounts) ? accounts : [];
  const capable = rows.filter((row) => {
    const roles = Array.isArray(row.roles) ? row.roles : [];
    return roles.some((r) => String(r).toLowerCase() === need.toLowerCase());
  });
  if (!capable.length) {
    return {
      ok: false,
      kind: 'insufficient_access_no_alternate',
      message: 'No authenticated Google account has the required role.',
      current_account: current || null,
      required_role: need,
      project: clean(project) || null,
    };
  }

  const preferred = capable[0];
  const email = clean(preferred.account || preferred.email);
  const roleLabel = need.replace(/^roles\//, '');
  return {
    ok: false,
    kind: 'insufficient_access',
    message: 'This Google account does not have enough access.',
    current_account: current || null,
    required_role: need,
    project: clean(project) || null,
    alternate: {
      identity: email,
      roles: preferred.roles || [need],
      role_label: roleLabel,
    },
    remediation: {
      title: 'This Google account does not have enough access.',
      body: [
        'A locally authenticated Google account does:',
        '',
        `  ${email}`,
        `  ✓ ${roleLabel.charAt(0).toUpperCase()}${roleLabel.slice(1)}`,
      ],
      actions: [
        {
          id: 'retry',
          title: `Retry with ${email}`,
          command: `gcloud config set account ${email}`,
          recommended: true,
        },
        {
          id: 'always',
          title: 'Always use for this project',
          command: project
            ? `agentsam google-cloud connection set --identity ${email} --project ${project}`
            : `agentsam google-cloud connection set --identity ${email}`,
        },
        { id: 'cancel', title: 'Cancel' },
      ],
    },
  };
}

export function renderInsufficientAccessCard(diagnosis) {
  if (!diagnosis || diagnosis.ok) return '';
  const rem = diagnosis.remediation;
  if (!rem) return `  ✕ ${diagnosis.message}\n`;
  const lines = ['', `  ${rem.title}`, ''];
  for (const line of rem.body || []) lines.push(`  ${line}`);
  lines.push('');
  for (const action of rem.actions || []) {
    const key =
      action.id === 'retry' ? '[enter]' : action.id === 'always' ? '[a]    ' : action.id === 'cancel' ? '[c]    ' : `[${action.id}]`;
    lines.push(`  ${key} ${action.title}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function renderGoogleCloudConnection(connection) {
  if (!connection) {
    return [
      '',
      '  Agent Sam · Google Cloud connection',
      '',
      '  (none stored)',
      '',
      '  Set with:',
      '    agentsam google-cloud connection set --identity you@example.com --project PROJECT_ID',
      '',
    ].join('\n');
  }
  return [
    '',
    '  Agent Sam · Google Cloud connection',
    '',
    `  identity        ${connection.identity || '—'}`,
    `  organization    ${connection.organization || '—'}`,
    `  project         ${connection.project || '—'}`,
    `  billing         ${connection.billing_account || '—'}`,
    `  updated         ${connection.updated_at || '—'}`,
    '',
    '  Operations should use this preference explicitly — not ambient gcloud active account.',
    '',
  ].join('\n');
}
