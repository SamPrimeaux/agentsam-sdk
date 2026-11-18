import { createSceneRuntime, parseSceneDocument } from '../../dist/src/index.js';
import {
  compilePage,
  computeScrollProgress,
  createSection,
  createCopyBlock,
  sceneTimeAtProgress,
  stageAtProgress,
  SCROLL_PRESETS,
} from '@inneranimalmedia/theme-scenes';

const sectionElement = document.querySelector('[data-scene-scroll]');
const canvasHost = document.getElementById('scene-canvas');
const errorElement = document.getElementById('scene-error');
const eyebrowElement = document.getElementById('chapter-eyebrow');
const titleElement = document.getElementById('chapter-title');
const bodyElement = document.getElementById('chapter-body');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const hintElement = document.getElementById('scroll-hint');

const sceneUrl = new URL('../retrofuturistic-circuit-loop/retrofuturistic-circuit-loop.iamscene.json', import.meta.url);
const assetBaseUrl = new URL('../retrofuturistic-circuit-loop/', import.meta.url);
const page = {
  id: 'retrofuturistic-circuit-story',
  theme: 'inneranimal',
  sections: [createSection({
    id: 'circuit-story',
    scene: 'interactive.stage',
    visual: 'visual.iam-scene',
    sceneDocument: { assetRole: 'scene.circuit-loop' },
    sceneAnimation: {
      id: 'circuit-loop',
      playback: 'scroll',
      startProgress: 0,
      endProgress: 1,
    },
    scroll: {
      ...SCROLL_PRESETS.cinematic,
      pin: 0,
      stages: [
        { at: 0, id: 'ignition' },
        { at: 0.36, id: 'routing' },
        { at: 0.72, id: 'continuity' },
      ],
    },
    groups: [{
      blocks: [createCopyBlock({
        variant: 'display',
        title: 'A system begins with a single pulse.',
        body: 'Scroll to move through the native scene.',
      })],
    }],
  })],
};

const plan = compilePage(page, {
  resolveAsset: (role) => role === 'scene.circuit-loop' ? sceneUrl.toString() : null,
});
if (!plan.validation.ok) {
  throw new Error('theme_scene_page_invalid:' + JSON.stringify(plan.validation.errors));
}
const section = plan.sections[0];
const sceneResponse = await fetch(section.sceneHost.document.url);
if (!sceneResponse.ok) throw new Error('iamscene_document_fetch_failed:' + sceneResponse.status);
const sceneDocument = parseSceneDocument(await sceneResponse.text());
const animation = sceneDocument.animations.find((item) => item.id === section.sceneHost.animation.id);
if (!animation) throw new Error('iamscene_animation_not_found:' + section.sceneHost.animation.id);

let runtime;
let scheduledFrame = 0;
let disposed = false;
let activeStage = '';

try {
  runtime = await createSceneRuntime({
    container: canvasHost,
    document: sceneDocument,
    assetBaseUrl,
    autoPlay: false,
    controls: false,
  });
  runtime.pause();
  sectionElement.style.height = `${window.innerHeight * ((section.scroll.length || 280) + 100) / 100}px`;

  const chapters = {
    ignition: {
      eyebrow: '01 / IGNITION',
      title: 'A system begins with a single pulse.',
      body: 'The first signal establishes the path. The scene remains a portable, editable document.',
    },
    routing: {
      eyebrow: '02 / ROUTING',
      title: 'Every connection has a purpose.',
      body: 'The circuit paths and traveling pulse are sampled directly from the scene animation.',
    },
    continuity: {
      eyebrow: '03 / CONTINUITY',
      title: 'The whole system moves together.',
      body: 'The page controls the timeline without changing the underlying geometry or animation source.',
    },
  };

  const update = () => {
    if (disposed) return;
    const progress = computeScrollProgress(
      window.scrollY,
      sectionElement.getBoundingClientRect(),
      section.scroll,
    );
    const time = sceneTimeAtProgress(progress, animation.duration, {
      start: section.sceneAnimation.startProgress,
      end: section.sceneAnimation.endProgress,
    });
    runtime.seekAnimation(animation.id, time, { wrap: false });

    const stage = stageAtProgress(progress, section.scroll.stages);
    if (stage && stage.id !== activeStage) {
      activeStage = stage.id;
      const chapter = chapters[stage.id];
      if (chapter) {
        eyebrowElement.textContent = chapter.eyebrow;
        titleElement.textContent = chapter.title;
        bodyElement.textContent = chapter.body;
      }
    }
    progressFill.style.transform = `scaleX(${progress})`;
    progressLabel.textContent = `${Math.round(progress * 100)}%`;
  };

  const schedule = () => {
    if (scheduledFrame || disposed) return;
    scheduledFrame = requestAnimationFrame(() => {
      scheduledFrame = 0;
      update();
    });
  };
  const onResize = () => {
    sectionElement.style.height = `${window.innerHeight * ((section.scroll.length || 280) + 100) / 100}px`;
    schedule();
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', onResize);
    if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
    runtime.dispose();
  };

  window.addEventListener('pagehide', cleanup, { once: true });
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    runtime.seekAnimation(animation.id, 0, { wrap: false });
    hintElement.textContent = 'Reduced motion is enabled; the scene is shown as a still frame.';
  } else {
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    update();
  }
} catch (error) {
  console.error('[iamscene] Scroll story failed to mount', error);
  errorElement.hidden = false;
}
