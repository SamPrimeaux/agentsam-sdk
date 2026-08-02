/**
 * CMS Site Scaffold Wizard
 *
 * Guides the user step-by-step through scaffolding a
 * Cloudflare Worker + D1 + R2 CMS site with:
 *   - global nav
 *   - reusable page templates
 *   - optional blog, contact, about pages
 *   - wrangler.toml ready to deploy
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
import { cmsTemplates } from '../templates/cms/index.js';

export async function runCmsWizard() {
  note('A Cloudflare Worker + D1 + R2 CMS site with reusable page templates.', 'CMS Site');

  // ── Step 1: Project name ──────────────────────────────────────────────────
  const projectName = await text({
    message: 'Project name?',
    placeholder: 'my-client-site',
    validate(val) {
      if (!val || val.trim().length === 0) return 'Required.';
      if (!/^[a-z0-9-]+$/.test(val.trim())) return 'Lowercase letters, numbers, and hyphens only.';
    },
  });
  if (isCancel(projectName)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 2: Site title ────────────────────────────────────────────────────
  const siteTitle = await text({
    message: 'Site title?',
    placeholder: 'Acme Corp',
    validate(val) {
      if (!val || val.trim().length === 0) return 'Required.';
    },
  });
  if (isCancel(siteTitle)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 3: Nav style ─────────────────────────────────────────────────────
  const navStyle = await select({
    message: 'Global nav style?',
    options: [
      { value: 'topbar', label: 'Top bar', hint: 'Horizontal links, fixed to top' },
      { value: 'sidebar', label: 'Sidebar', hint: 'Left rail, collapsible on mobile' },
      { value: 'minimal', label: 'Minimal', hint: 'Logo + hamburger only' },
    ],
  });
  if (isCancel(navStyle)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 4: Pages to include ──────────────────────────────────────────────
  const pages = await multiselect({
    message: 'Which pages do you want? (space to toggle, enter to confirm)',
    options: [
      { value: 'home',    label: 'Home',    hint: 'Landing / hero section' },
      { value: 'about',   label: 'About',   hint: 'About us / team' },
      { value: 'services', label: 'Services', hint: 'Services or products list' },
      { value: 'blog',    label: 'Blog',    hint: 'D1-backed post list + detail' },
      { value: 'contact', label: 'Contact', hint: 'Contact form → Resend email' },
      { value: 'privacy', label: 'Privacy', hint: 'Privacy policy (static)' },
    ],
    required: true,
  });
  if (isCancel(pages)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 5: Page template style ───────────────────────────────────────────
  const templateStyle = await select({
    message: 'Page template style?',
    options: [
      {
        value: 'fragment',
        label: 'R2 HTML fragments',
        hint: 'Each section is a .html fragment stored in R2, assembled by the Worker',
      },
      {
        value: 'json',
        label: 'D1-driven JSON blocks',
        hint: 'Page content stored in D1 as JSON blocks, rendered server-side',
      },
      {
        value: 'static',
        label: 'Static HTML',
        hint: 'Pre-rendered HTML files, no D1 dependency',
      },
    ],
  });
  if (isCancel(templateStyle)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 6: Contact form destination (only if contact page selected) ──────
  let contactEmail = null;
  if (pages.includes('contact')) {
    contactEmail = await text({
      message: 'Where should contact form submissions go? (email)',
      placeholder: 'hello@example.com',
      validate(val) {
        if (!val || val.trim().length === 0) return 'Required for contact page.';
        if (!val.includes('@')) return 'Enter a valid email.';
      },
    });
    if (isCancel(contactEmail)) { cancel('Cancelled.'); process.exit(0); }
  }

  // ── Step 7: Cloudflare account details ────────────────────────────────────
  const cfAccountId = await text({
    message: 'Cloudflare account ID? (from dash.cloudflare.com → right sidebar)',
    placeholder: 'abc123...',
    validate(val) {
      if (!val || val.trim().length === 0) return 'Required for wrangler.toml.';
    },
  });
  if (isCancel(cfAccountId)) { cancel('Cancelled.'); process.exit(0); }

  // ── Step 8: Confirm before writing ───────────────────────────────────────
  const summary = [
    `  Project:   ${pc.cyan(projectName)}`,
    `  Title:     ${pc.cyan(siteTitle)}`,
    `  Nav:       ${pc.cyan(navStyle)}`,
    `  Pages:     ${pc.cyan(pages.join(', '))}`,
    `  Template:  ${pc.cyan(templateStyle)}`,
    contactEmail ? `  Contact:   ${pc.cyan(contactEmail)}` : null,
  ].filter(Boolean).join('\n');

  note(summary, 'Your scaffold');

  const confirmed = await confirm({ message: 'Write files now?' });
  if (isCancel(confirmed) || !confirmed) { cancel('Cancelled.'); process.exit(0); }

  // ── Write files ───────────────────────────────────────────────────────────
  const s = spinner();
  s.start('Generating files...');

  const config = {
    projectName: projectName.trim(),
    siteTitle: siteTitle.trim(),
    navStyle,
    pages,
    templateStyle,
    contactEmail: contactEmail?.trim() ?? null,
    cfAccountId: cfAccountId.trim(),
  };

  const fileTree = cmsTemplates(config);

  await writeFileTree(`./${config.projectName}`, fileTree);

  s.stop(pc.green(`Files written to ./${config.projectName}/`));

  note(
    [
      `cd ${config.projectName}`,
      `npm install`,
      ``,
      `# Create your D1 database:`,
      `npx wrangler d1 create ${config.projectName}`,
      `# Copy the database_id into wrangler.toml [[d1_databases]] binding`,
      ``,
      `# Run the D1 migration:`,
      `npx wrangler d1 execute ${config.projectName} --file=migrations/001_init.sql --remote`,
      ``,
      `# Deploy:`,
      `npx wrangler deploy`,
    ].join('\n'),
    'Next steps'
  );
}
