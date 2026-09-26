/**
 * Read-only Google Cloud inventory for AgentSam Connections / CLI.
 * Never prints private key material or access tokens.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

export async function runGcloudJson(args, env = process.env, timeoutMs = 45000) {
  try {
    const { stdout, stderr } = await execFileAsync('gcloud', args, {
      timeout: timeoutMs,
      env,
      maxBuffer: 8 * 1024 * 1024,
    });
    const text = String(stdout || '').trim();
    return {
      ok: true,
      code: 0,
      data: text ? JSON.parse(text) : null,
      stderr: String(stderr || '').trim(),
    };
  } catch (error) {
    const stdout = String(error?.stdout || '').trim();
    let data = null;
    if (stdout) {
      try {
        data = JSON.parse(stdout);
      } catch {
        data = null;
      }
    }
    return {
      ok: false,
      code: Number(error?.code) || 1,
      data,
      stderr: String(error?.stderr || error?.message || '').trim(),
      stdout,
    };
  }
}

export async function resolveActiveProject(env = process.env, explicit = '') {
  if (clean(explicit)) return clean(explicit);
  const result = await runGcloudJson(['config', 'get-value', 'project', '--format=json'], env, 10000);
  if (result.ok && result.data && result.data !== '(unset)') return String(result.data);
  return '';
}

function shortName(email) {
  const local = String(email || '').split('@')[0] || '';
  return local;
}

function classifySa(email, displayName = '') {
  const id = `${email} ${displayName}`.toLowerCase();
  if (/agentsam-env-controller|agentsam-env-builder|agent-sam-vertex/.test(id)) return 'agentsam';
  if (/compute@developer\.gserviceaccount\.com/.test(email)) return 'compute_default';
  if (/firebase|vertex-express/.test(id)) return 'provider_service';
  if (/ais-gemini-key|meauxide|agentsamremix|remix/.test(id)) return 'historical';
  if (/billing-reader/.test(id)) return 'billing';
  return 'other';
}

function dispositionHint(bucket, roles, keys, attached) {
  const userKeys = (keys || []).filter((k) => String(k.key_type || k.keyType).toUpperCase() === 'USER_MANAGED');
  if (bucket === 'agentsam') {
    if (userKeys.length) return 'KEEP · ROTATE user-managed keys';
    return 'KEEP';
  }
  if (bucket === 'compute_default' && attached.length) return 'KEEP · active VM attachment';
  if (bucket === 'provider_service') return 'KEEP · inspect if product still uses provider';
  if (bucket === 'billing') {
    if (userKeys.length) return 'KEEP · ROTATE user-managed key';
    return 'KEEP if billing export used';
  }
  if (bucket === 'historical') {
    if (!(roles || []).length) return 'INSPECT → likely DELETE if unused';
    return 'PROVENANCE · DETACH/DELETE after confirm unused';
  }
  if (!(roles || []).length && !attached.length) return 'INSPECT · no project IAM roles';
  return 'INSPECT';
}

/**
 * Build inventory for one project. Does not create/rotate/delete keys.
 */
export async function collectGoogleCloudServiceAccountInventory(options = {}) {
  const env = options.env || process.env;
  const projectId = await resolveActiveProject(env, options.projectId);
  if (!projectId) {
    return {
      schema_version: 'agentsam-gcp-sa-inventory-v1',
      ok: false,
      error: 'no_active_project',
      project_id: null,
      accounts: [],
    };
  }

  const list = await runGcloudJson(
    ['iam', 'service-accounts', 'list', `--project=${projectId}`, '--format=json'],
    env,
  );
  if (!list.ok) {
    return {
      schema_version: 'agentsam-gcp-sa-inventory-v1',
      ok: false,
      error: 'service_accounts_list_failed',
      detail: list.stderr,
      project_id: projectId,
      accounts: [],
    };
  }

  const policy = await runGcloudJson(
    ['projects', 'get-iam-policy', projectId, '--format=json'],
    env,
  );
  const bindings = Array.isArray(policy.data?.bindings) ? policy.data.bindings : [];

  const instances = await runGcloudJson(
    ['compute', 'instances', 'list', `--project=${projectId}`, '--format=json'],
    env,
  );
  const instanceRows = Array.isArray(instances.data) ? instances.data : [];

  const accounts = [];
  for (const sa of Array.isArray(list.data) ? list.data : []) {
    const email = clean(sa.email);
    if (!email) continue;
    const member = `serviceAccount:${email}`;
    const roles = bindings
      .filter((b) => Array.isArray(b.members) && b.members.includes(member))
      .map((b) => b.role)
      .filter(Boolean)
      .sort();

    const keysResult = await runGcloudJson(
      [
        'iam',
        'service-accounts',
        'keys',
        'list',
        `--iam-account=${email}`,
        `--project=${projectId}`,
        '--format=json',
      ],
      env,
    );
    const rawKeys = Array.isArray(keysResult.data) ? keysResult.data : [];
    const keys = rawKeys.map((key) => ({
      // Google key id basename only — never private key material
      key_id: clean(key.name).split('/').pop() || null,
      key_type: key.keyType || null,
      key_origin: key.keyOrigin || null,
      // Product overlay: Google API origin stays GOOGLE_PROVIDED.
      // INNERANIMALMEDIA_PROVIDED is reserved for AgentSam-issued credentials in our vault.
      agentsam_origin_label:
        String(key.keyOrigin || '').toUpperCase() === 'GOOGLE_PROVIDED'
          ? 'GOOGLE_PROVIDED'
          : String(key.keyOrigin || 'UNKNOWN'),
      created_at: key.validAfterTime || null,
      expires_at: key.validBeforeTime || null,
      disabled: Boolean(key.disabled),
    }));

    const attached = instanceRows
      .filter((inst) => (inst.serviceAccounts || []).some((row) => row.email === email))
      .map((inst) => ({
        name: inst.name,
        zone: clean(inst.zone).split('/').pop(),
        status: inst.status,
      }));

    const bucket = classifySa(email, sa.displayName);
    accounts.push({
      email,
      name: sa.displayName || shortName(email),
      short_name: shortName(email),
      disabled: Boolean(sa.disabled),
      bucket,
      roles,
      keys,
      key_counts: {
        total: keys.length,
        system_managed: keys.filter((k) => String(k.key_type).toUpperCase() === 'SYSTEM_MANAGED').length,
        user_managed: keys.filter((k) => String(k.key_type).toUpperCase() === 'USER_MANAGED').length,
      },
      attached,
      disposition_hint: dispositionHint(bucket, roles, keys, attached),
      status: sa.disabled ? 'disabled' : attached.length ? 'active' : roles.length ? 'ready' : 'orphan_roles',
    });
  }

  accounts.sort((a, b) => a.email.localeCompare(b.email));

  return {
    schema_version: 'agentsam-gcp-sa-inventory-v1',
    ok: true,
    project_id: projectId,
    generated_at: new Date().toISOString(),
    accounts,
    policy_readable: policy.ok,
    instances_readable: instances.ok,
  };
}

export async function inspectGoogleCloudServiceAccount(options = {}) {
  const inventory = await collectGoogleCloudServiceAccountInventory(options);
  if (!inventory.ok) return inventory;
  const needle = clean(options.account).toLowerCase();
  const hit = inventory.accounts.find(
    (row) =>
      row.email.toLowerCase() === needle ||
      row.short_name.toLowerCase() === needle ||
      row.name.toLowerCase() === needle ||
      row.email.toLowerCase().startsWith(`${needle}@`),
  );
  return {
    schema_version: 'agentsam-gcp-sa-inspect-v1',
    ok: Boolean(hit),
    project_id: inventory.project_id,
    account: hit || null,
    error: hit ? null : 'service_account_not_found',
  };
}

export async function collectGoogleCloudDoctor(options = {}) {
  const env = options.env || process.env;
  const projectId = await resolveActiveProject(env, options.projectId);
  const auth = await runGcloudJson(['auth', 'list', '--filter=status:ACTIVE', '--format=json'], env, 15000);
  const billing = projectId
    ? await runGcloudJson(['billing', 'projects', 'describe', projectId, '--format=json'], env, 20000)
    : { ok: false, data: null, stderr: 'no_project' };
  const inventory = projectId
    ? await collectGoogleCloudServiceAccountInventory({ env, projectId })
    : { ok: false, accounts: [] };

  const activeAccounts = Array.isArray(auth.data) ? auth.data : [];
  const issues = [];
  if (!activeAccounts.length) issues.push({ code: 'no_active_gcloud_auth', severity: 'high' });
  if (!projectId) issues.push({ code: 'no_active_project', severity: 'high' });
  if (billing.ok === false && projectId) {
    issues.push({ code: 'billing_describe_failed', severity: 'medium', detail: billing.stderr });
  }
  const userManaged = (inventory.accounts || []).flatMap((sa) =>
    (sa.keys || [])
      .filter((k) => String(k.key_type).toUpperCase() === 'USER_MANAGED')
      .map((k) => ({ email: sa.email, key_id: k.key_id, expires_at: k.expires_at })),
  );
  if (userManaged.length) {
    issues.push({
      code: 'user_managed_sa_keys_present',
      severity: 'medium',
      count: userManaged.length,
      note: 'Prefer ADC/workload identity; rotate long-lived USER_MANAGED keys.',
    });
  }

  return {
    schema_version: 'agentsam-gcp-doctor-v1',
    ok: issues.every((i) => i.severity !== 'high'),
    project_id: projectId || null,
    auth_active: activeAccounts.length > 0,
    // Do not include account email addresses in names-only callers; include count only by default.
    auth_account_count: activeAccounts.length,
    billing: billing.ok
      ? {
          enabled: Boolean(billing.data?.billingEnabled),
          account_name: billing.data?.billingAccountName || null,
        }
      : { enabled: null, account_name: null, error: billing.stderr || null },
    service_accounts: inventory.ok ? inventory.accounts.length : 0,
    user_managed_keys: userManaged.length,
    issues,
    credential_lanes: {
      agentsam_api_key: 'InnerAnimalMedia account / platform authority (aak_*) — not a GCP SA key',
      agentsam_bridge_key: 'Machine↔AgentSam Worker/ExecOS trust — not a Google SYSTEM_MANAGED key',
      google_user_oauth: 'Human gcloud / ADC session used to discover this inventory',
      google_sa: 'Workload identity inside the customer GCP project',
    },
  };
}

export function renderServiceAccountTable(inventory) {
  const lines = [
    '',
    `  Agent Sam · Google Cloud · service accounts`,
    `  Project  ${inventory.project_id || '(unset)'}`,
    '',
    '  NAME                             ATTACHED      KEYS   USER   STATUS      HINT',
  ];
  for (const row of inventory.accounts || []) {
    const attached = row.attached?.map((a) => a.name).join(',') || '—';
    const name = String(row.name || row.short_name).slice(0, 32).padEnd(32);
    const att = attached.slice(0, 12).padEnd(12);
    const keys = String(row.key_counts?.total ?? 0).padStart(4);
    const user = String(row.key_counts?.user_managed ?? 0).padStart(4);
    const status = String(row.status || '').padEnd(10);
    lines.push(`  ${name}  ${att}  ${keys}   ${user}   ${status}  ${row.disposition_hint || ''}`);
  }
  lines.push('');
  lines.push('  Key origin note');
  lines.push('    Google API keyOrigin stays GOOGLE_PROVIDED for GCP-managed keys.');
  lines.push('    INNERANIMALMEDIA_PROVIDED is only for AgentSam-issued AGENTSAM_* credentials in our vault.');
  lines.push('    Never rewrite Google metadata; overlay labels live in AgentSam inventory only.');
  lines.push('');
  lines.push('  Inspect: agentsam google-cloud iam service-accounts inspect <name-or-email>');
  lines.push('');
  return lines.join('\n');
}

export function renderServiceAccountInspect(result) {
  if (!result.ok || !result.account) {
    return `\n  ✕ Service account not found${result.project_id ? ` in ${result.project_id}` : ''}.\n`;
  }
  const sa = result.account;
  const lines = [
    '',
    `  Agent Sam · Google Cloud · ${sa.short_name}`,
    '',
    '  Project',
    `    ${result.project_id}`,
    '',
    '  Email',
    `    ${sa.email}`,
    '',
    '  Bucket',
    `    ${sa.bucket}`,
    '',
    '  IAM roles',
  ];
  if (sa.roles.length) for (const role of sa.roles) lines.push(`    ${role}`);
  else lines.push('    (none on project IAM policy)');
  lines.push('');
  lines.push('  Keys (metadata only)');
  if (!sa.keys.length) lines.push('    (none listed)');
  for (const key of sa.keys) {
    lines.push(
      `    ${key.key_type || '?'}  ${key.agentsam_origin_label || key.key_origin || '?'}  created ${key.created_at || '?'}  expires ${key.expires_at || '?'}  id ${key.key_id || '?'}`,
    );
  }
  lines.push('');
  lines.push('  Attached compute');
  if (!sa.attached.length) lines.push('    —');
  for (const inst of sa.attached) {
    lines.push(`    ${inst.name}  ${inst.zone}  ${inst.status}`);
  }
  lines.push('');
  lines.push('  Disposition hint');
  lines.push(`    ${sa.disposition_hint}`);
  lines.push('');
  return lines.join('\n');
}
