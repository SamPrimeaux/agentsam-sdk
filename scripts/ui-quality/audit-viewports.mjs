#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { QUALITY_VIEWPORTS, BOUNDARY_VIEWPORTS } from './viewports.mjs';

const args = process.argv.slice(2);
const option = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const baseUrl = option('--url', '');
const expectedSelector = option('--expect', '');
const matrix = option('--matrix', 'standard');
const viewports = matrix === 'full' ? [...QUALITY_VIEWPORTS, ...BOUNDARY_VIEWPORTS] : QUALITY_VIEWPORTS;
const out = path.resolve(option('--out', '/tmp/agentsam-ui-quality'));
if (!baseUrl || !expectedSelector) {
  console.error('Usage: node scripts/ui-quality/audit-viewports.mjs --url http://127.0.0.1:8080/route --expect "[data-agent-conversation-surface]" [--out /tmp/ui-receipts]');
  process.exit(2);
}
const localRequire = createRequire(new URL('../../apps/local-studio/package.json', import.meta.url));
const { chromium } = localRequire('playwright');
const browser = await chromium.launch({ headless: true });
const results = [];
await fs.mkdir(out, { recursive: true });
try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.name === 'phone', hasTouch: viewport.name === 'phone' || viewport.name === 'tablet' });
    let result;
    try {
      const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 25000 });
      await page.screenshot({ path: path.join(out, viewport.name + '.png'), fullPage: true });
      const expectedCount = await page.locator(expectedSelector).count();
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const visible = (node) => {
          const r = node.getBoundingClientRect();
          const computed = window.getComputedStyle(node);
          return r.width > 0 && r.height > 0 && computed.visibility !== 'hidden' && computed.display !== 'none';
        };
        const missingAlt = [...document.querySelectorAll('img:not([alt])')]
          .filter(visible).map((node) => node.outerHTML.slice(0, 180));
        const missingNames = [...document.querySelectorAll('button, [role="button"]')]
          .filter(visible)
          .filter((node) => !node.getAttribute('aria-label') &&
            !node.getAttribute('aria-labelledby') && !node.textContent?.trim() &&
            !node.querySelector('img[alt]:not([alt=""])'))
          .map((node) => node.outerHTML.slice(0, 180));
        const touchTargets = [...document.querySelectorAll('button, [role="button"], a[href]')]
          .filter(visible).filter((node) => {
            const r = node.getBoundingClientRect();
            return r.width < 40 || r.height < 40;
          }).slice(0, 30).map((node) => node.outerHTML.slice(0, 180));
        return {
          documentWidth: doc.scrollWidth, windowWidth: window.innerWidth,
          horizontalOverflow: doc.scrollWidth > window.innerWidth + 1,
          missingAlt, missingNames, touchTargets,
        };
      });
      result = {
        ...viewport, status: response?.status() ?? null, url: page.url(),
        metrics, expectedSelector, expectedCount, passesProductSurface: expectedCount > 0,
        passesLayout: !metrics.horizontalOverflow,
        passesNaming: !metrics.missingAlt.length && !metrics.missingNames.length,
        passesTouch: viewport.name === 'phone' ? metrics.touchTargets.length === 0 : null,
      };
    } catch (error) {
      result = { ...viewport, error: String(error), passesLayout: false, passesNaming: false };
    } finally {
      await page.close();
    }
    results.push(result);
  }
} finally {
  await browser.close();
}
const failed = results.some((r) =>
  !r.passesLayout || !r.passesNaming || !r.passesProductSurface || r.passesTouch === false ||
  r.status >= 400 || r.error);
const receipt = {
  contract: 'agentsam.ui-quality.render.v1',
  status: failed ? 'NOT_READY' : 'PASS',
  source: baseUrl,
  expectedSelector,
  caveat: 'Checks layout, visible basic names, img alt and target dimensions; full WCAG axe, keyboard flows and visual layout review are separate required receipts.',
  results,
};
await fs.writeFile(path.join(out, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
if (failed) process.exitCode = 1;
