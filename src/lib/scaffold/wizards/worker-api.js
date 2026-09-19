/**
 * Worker API Scaffold Wizard
 * Bare Cloudflare Worker with typed route handlers and D1 binding.
 */

import {
  text,
  select,
  multiselect,
  confirm,
  spinner,
  note,
  isCancel,
  cancel,
} from '@clack/prompts';
import pc from 'picocolors';
import { writeFileTree } from '../writer.js';
import { workerApiTemplates } from '../templates/worker-api/index.js';
import { resolveCloudflareAccountId } from '../resolve-cloudflare-account.js';

export async function runWorkerApiWizard() {
  note('A typed Cloudflare Worker with route handlers, D1 binding, and CORS ready.', 'Worker API');

  const projectName = await text({
    message: 'Project name?',
    placeholder: 'my-api-worker',
    validate(val) {
      if (!val || val.trim().length === 0) return 'Required.';
      if (!/^[a-z0-9-]+$/.test(val.trim())) return 'Lowercase letters, numbers, and hyphens only.';
    },
  });
  if (isCancel(projectName)) { cancel('Cancelled.'); process.exit(0); }

  const routes = await multiselect({
    message: 'Which route groups do you want?',
    options: [
      { value: 'health',  label: 'GET /health',         hint: 'Liveness check' },
      { value: 'auth',    label: 'POST /auth/*',         hint: 'Token issue + verify' },
      { value: 'users',   label: 'CRUD /users',          hint: 'D1-backed user records' },
      { value: 'content', label: 'CRUD /content',        hint: 'Generic content/pages' },
      { value: 'webhook', label: 'POST /webhooks/:type', hint: 'Inbound webhook receiver' },
    ],
    required: true,
  });
  if (isCancel(routes)) { cancel('Cancelled.'); process.exit(0); }

  const dbKind = await select({
    message: 'Database?',
    options: [
      { value: 'd1', label: 'Cloudflare D1', hint: 'Native, free tier, SQLite' },
      { value: 'hyperdrive', label: 'Your own Postgres (Hyperdrive)', hint: 'Supabase, Neon, RDS, etc.' },
    ],
  });
  if (isCancel(dbKind)) { cancel('Cancelled.'); process.exit(0); }

  const cfAccountId = await resolveCloudflareAccountId({ text, select, isCancel, cancel, note, pc });

  const confirmed = await confirm({ message: `Write files to ./${projectName.trim()}/?` });
  if (isCancel(confirmed) || !confirmed) { cancel('Cancelled.'); process.exit(0); }

  const s = spinner();
  s.start('Generating files...');

  const config = { projectName: projectName.trim(), routes, cfAccountId: cfAccountId.trim(), dbKind };
  const fileTree = workerApiTemplates(config);
  await writeFileTree(`./${config.projectName}`, fileTree);

  s.stop(pc.green(`Files written to ./${config.projectName}/`));

  const nextSteps = dbKind === 'hyperdrive'
    ? [
        `cd ${config.projectName}`,
        `npm install`,
        `npx wrangler hyperdrive create ${config.projectName} --connection-string="postgres://user:pass@host:5432/db"`,
        `# paste the returned Hyperdrive id into wrangler.toml`,
        `npx wrangler deploy`,
      ]
    : [
        `cd ${config.projectName}`,
        `npm install`,
        `npx wrangler d1 create ${config.projectName}`,
        `npx wrangler d1 execute ${config.projectName} --file=migrations/001_init.sql --remote`,
        `npx wrangler deploy`,
      ];
  note(nextSteps.join('\n'), 'Next steps');
}
