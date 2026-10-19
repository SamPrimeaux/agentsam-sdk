import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evidenceError } from './contract.js';
import { resolveViewport } from './viewports.js';

const ACTIONS = new Set(['click', 'hover', 'fill', 'press', 'waitForSelector', 'waitMs']);

function checkUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw evidenceError('evidence_source_invalid', 'url'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw evidenceError('evidence_source_invalid', 'url_protocol');
  return url.toString();
}

/**
 * Browser capture source. The Playwright module is injected (a module or an async loader), so the SDK
 * carries no browser dependency. Only a small, declarative action vocabulary is allowed: agents cannot
 * run arbitrary scripts in the page. Page errors are recorded with the capture, never silently dropped.
 *
 * source: { kind: 'playwright', url, actions?, mask?, fullPage?, colorScheme?, scale?, waitMs?, record?, durationMs? }
 */
export function createPlaywrightSource({ playwright, browserType = 'chromium', launchOptions = {}, scale = 2, waitMs = 1000, timeoutMs = 30000 } = {}) {
  if (!playwright) throw evidenceError('evidence_driver_unavailable', 'playwright');
  let launched = null;
  const browser = async () => {
    if (!launched) {
      launched = (async () => {
        const mod = typeof playwright === 'function' ? await playwright() : playwright;
        const type = mod?.[browserType] ?? mod?.default?.[browserType];
        if (typeof type?.launch !== 'function') throw evidenceError('evidence_driver_unavailable', 'playwright');
        try { return await type.launch({ headless: true, ...launchOptions }); } catch (error) {
          // No bundled browser build: fall back to an installed Chrome, unless the caller chose explicitly.
          if (launchOptions.channel || launchOptions.executablePath || !/Executable doesn't exist/.test(String(error?.message))) throw error;
          return type.launch({ headless: true, channel: 'chrome' }).catch(() => { throw error; });
        }
      })().catch((error) => { launched = null; throw error; });
    }
    return launched;
  };

  const capture = async ({ source, viewport }) => {
    if (!viewport) throw evidenceError('evidence_viewport_required');
    const vp = resolveViewport(viewport);
    const url = checkUrl(source.url);
    const factor = Number.isFinite(source.scale) ? source.scale : scale;
    const record = source.record === true;
    const videoDir = record ? await mkdtemp(path.join(tmpdir(), 'evidence-video-')) : null;
    const context = await (await browser()).newContext({
      viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: factor,
      isMobile: vp.class === 'mobile', hasTouch: vp.class !== 'desktop',
      colorScheme: source.colorScheme === 'dark' ? 'dark' : 'light', reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC',
      ...(record ? { recordVideo: { dir: videoDir, size: { width: vp.width, height: vp.height } } } : {}),
    });
    const errors = [];
    try {
      const page = await context.newPage();
      page.on('pageerror', (error) => errors.push(`pageerror: ${String(error?.message ?? error).slice(0, 300)}`));
      page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text().slice(0, 300)}`); });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(Number.isFinite(source.waitMs) ? source.waitMs : waitMs);
      for (const action of source.actions ?? []) {
        if (!ACTIONS.has(action?.type)) throw evidenceError('evidence_source_invalid', 'action');
        const selector = String(action.selector ?? '');
        if (action.type === 'click') await page.locator(selector).first().click({ timeout: timeoutMs });
        else if (action.type === 'hover') await page.locator(selector).first().hover({ timeout: timeoutMs });
        else if (action.type === 'fill') await page.locator(selector).first().fill(String(action.value ?? ''), { timeout: timeoutMs });
        else if (action.type === 'press') await page.keyboard.press(String(action.key ?? ''));
        else if (action.type === 'waitForSelector') await page.locator(selector).first().waitFor({ timeout: timeoutMs });
        else await page.waitForTimeout(Math.min(Math.max(Number(action.ms) || 0, 0), 10000));
      }
      const meta = { url, viewport, scale: factor, pageErrors: errors };
      if (record) {
        await page.waitForTimeout(Math.min(Number(source.durationMs) || 2000, 60000));
        const video = page.video();
        await context.close();
        return { bytes: await readFile(await video.path()), ext: 'webm', durationMs: Math.min(Number(source.durationMs) || 2000, 60000), meta };
      }
      const bytes = await page.screenshot({
        type: 'png', fullPage: source.fullPage === true, animations: 'disabled', caret: 'hide',
        mask: (source.mask ?? []).map((selector) => page.locator(String(selector))),
      });
      return { bytes, ext: 'png', meta };
    } finally {
      await context.close().catch(() => {});
      if (videoDir) await rm(videoDir, { recursive: true, force: true });
    }
  };
  capture.close = async () => { if (launched) { const b = await launched; launched = null; await b.close(); } };
  return capture;
}
