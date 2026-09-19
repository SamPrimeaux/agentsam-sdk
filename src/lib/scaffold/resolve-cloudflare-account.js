/**
 * Shared Cloudflare account resolution for scaffold wizards.
 * Reuses the same detection the CLI's `agentsam env init cloudflare` flow
 * already relies on — never ask the user to hand-paste an account ID that
 * `wrangler whoami` (or an existing env override) can already answer.
 */
import { detectCloudflareAccounts } from '../../commands/env.js';

export async function resolveCloudflareAccountId({ text, select, isCancel, cancel, note, pc, detectAccounts = detectCloudflareAccounts }) {
  const detected = detectAccounts();

  if (detected.accounts.length === 1) {
    const acct = detected.accounts[0];
    note(`Detected Cloudflare account: ${pc.cyan(acct.name || acct.id)}`, 'Cloudflare account');
    return acct.id;
  }

  if (detected.accounts.length > 1) {
    const choice = await select({
      message: 'Which Cloudflare account?',
      options: detected.accounts.map((a) => ({ value: a.id, label: a.name || a.id, hint: a.id })),
    });
    if (isCancel(choice)) { cancel('Cancelled.'); process.exit(0); }
    return choice;
  }

  note('Could not auto-detect a Cloudflare account (run `agentsam cloudflare` to check login status).', 'Cloudflare account');
  const cfAccountId = await text({
    message: 'Cloudflare account ID? (from dash.cloudflare.com → right sidebar)',
    placeholder: 'abc123...',
    validate(val) {
      if (!val || val.trim().length === 0) return 'Required.';
    },
  });
  if (isCancel(cfAccountId)) { cancel('Cancelled.'); process.exit(0); }
  return cfAccountId.trim();
}
