import { parseSceneDocument } from './document.js';
import { createSceneRuntime, type SceneRuntimeHandle } from './runtime.js';
import type { SceneDocument } from './types.js';

const SELECTOR = '[data-iam-scene-document]';
type MountedScene = {
  runtime: SceneRuntimeHandle;
  cleanup: () => void;
};
const mounted = new WeakMap<HTMLElement, MountedScene>();
const inFlight = new WeakMap<HTMLElement, Promise<MountedScene | null>>();
const clamp = (value: number) => Math.max(0, Math.min(1, value));

function sceneDocumentUrl(element: HTMLElement): URL | null {
  const raw = element.dataset.iamSceneDocument;
  if (!raw || raw.startsWith('//') || /[\\\u0000-\u001f]/.test(raw)) return null;
  try {
    const url = new URL(raw, document.baseURI);
    if (url.protocol !== 'https:' && url.origin !== window.location.origin) return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url;
  } catch {
    return null;
  }
}

async function mountElement(element: HTMLElement): Promise<MountedScene | null> {
  if (mounted.has(element)) return mounted.get(element)!;
  const pending = inFlight.get(element);
  if (pending) return pending;
  const task = (async () => {
    const url = sceneDocumentUrl(element);
    if (!url) {
      element.dataset.iamSceneError = 'scene_document_url_invalid';
      return null;
    }
    try {
      const response = await fetch(url.href, {
        credentials: url.origin === window.location.origin ? 'same-origin' : 'omit',
        headers: { Accept: 'application/json, application/vnd.inneranimalmedia.iamscene+json' },
      });
      if (!response.ok) throw new Error(`scene_document_fetch_failed:${response.status}`);
      const documentData = parseSceneDocument(await response.arrayBuffer());
      const playback = element.dataset.iamScenePlayback || 'autoplay';
      const animationId = element.dataset.iamSceneAnimation || undefined;
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      const runtime = await createSceneRuntime({
        container: element,
        document: documentData,
        assetBaseUrl: new URL('.', url).href,
        autoPlay: !reducedMotion && playback === 'autoplay' ? animationId || false : false,
        controls: element.dataset.iamSceneControls !== 'false',
      });
      let frame = 0;
      const animation = animationId
        ? documentData.animations.find((entry) => entry.id === animationId)
        : undefined;
      const startProgress = Number(element.dataset.iamSceneStartProgress ?? 0);
      const endProgress = Number(element.dataset.iamSceneEndProgress ?? 1);
      const scrollMode = element.dataset.sceneScrollMode || 'natural';
      const onScroll = () => {
        if (frame || !animation || playback !== 'scroll' || reducedMotion) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const rect = element.getBoundingClientRect();
          const viewport = Math.max(1, window.innerHeight);
          const pageProgress = clamp((viewport - rect.top) / (viewport + rect.height));
          const range = Math.max(0.0001, endProgress - startProgress);
          const localProgress = clamp((pageProgress - startProgress) / range);
          runtime.seekAnimation(animation.id, localProgress * animation.duration);
        });
      };
      if (playback === 'scroll' && animation && !reducedMotion) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        onScroll();
      }
      const cleanup = () => {
        if (frame) cancelAnimationFrame(frame);
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        runtime.dispose();
      };
      const result = { runtime, cleanup };
      mounted.set(element, result);
      element.dataset.iamSceneReady = 'true';
      delete element.dataset.iamSceneError;
      element.dataset.iamSceneScrollMode = scrollMode;
      return result;
    } catch (error) {
      element.dataset.iamSceneError = error instanceof Error ? error.message : 'scene_runtime_failed';
      return null;
    } finally {
      inFlight.delete(element);
    }
  })();
  inFlight.set(element, task);
  return task;
}

export async function mountIamsceneElements(root: ParentNode = document): Promise<void> {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  await Promise.all(elements.map((element) => mountElement(element)));
}

export function unmountIamsceneElements(root: ParentNode = document): void {
  const elements = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
  for (const element of elements) {
    const instance = mounted.get(element);
    if (!instance) continue;
    instance.cleanup();
    mounted.delete(element);
    delete element.dataset.iamSceneReady;
  }
}

function start() {
  void mountIamsceneElements(document);
  if (typeof MutationObserver === 'undefined') return;
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof HTMLElement) {
          if (node.matches(SELECTOR)) void mountElement(node);
          else void mountIamsceneElements(node);
        }
      }
      for (const node of Array.from(record.removedNodes)) {
        if (node instanceof HTMLElement) unmountIamsceneElements(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export const IamSceneBrowserRuntime = Object.freeze({
  mountAll: mountIamsceneElements,
  unmountAll: unmountIamsceneElements,
});

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  (globalThis as typeof globalThis & { IamSceneRuntime?: typeof IamSceneBrowserRuntime }).IamSceneRuntime = IamSceneBrowserRuntime;
}
