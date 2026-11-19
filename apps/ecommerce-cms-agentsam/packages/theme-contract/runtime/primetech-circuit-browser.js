/**
 * The original PrimeTech I.AM Scene source-mesh circuit showcase, mounted as a
 * portable section visual. Meshes, radial reveal animation and hover/tap behavior
 * are unchanged; only the host selectors and self-hosted asset base are adapted.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  createSceneRuntime,
  parseSceneDocument,
  sampleAnimationTrack,
} from "./primetech/vendor/dist/src/index.js";

const SCENE_PATH = "/assets/primetech/scenes/original-4341/original-4341.iamscene.json";

function mountCircuit(stage) {
  if (stage.dataset.initialized === "true") return;
  const mount = stage.querySelector("[data-primetech-circuit-canvas]");
  const errorMessage = stage.querySelector("[data-primetech-circuit-error]");
  if (!mount || !errorMessage) return;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let runtime = null;
  let bloom = null;
  let resizeObserver = null;
  let eventController = null;
  let releaseFrame = 0;
  let touchStopTimer = 0;
  let disposed = false;
  let resizeHandler = null;

  const setState = (state) => { stage.dataset.state = state; };

  function dispose() {
    disposed = true;
    if (releaseFrame) cancelAnimationFrame(releaseFrame);
    clearTimeout(touchStopTimer);
    eventController?.abort();
    resizeObserver?.disconnect();
    if (resizeHandler) window.removeEventListener("resize", resizeHandler);
    runtime?.dispose();
    bloom?.dispose();
    runtime = null;
    bloom = null;
  }

  async function mountScene() {
    if (stage.dataset.initialized === "true") return;
    stage.dataset.initialized = "true";
    stage.dataset.status = "loading";
    errorMessage.hidden = true;

    try {
      const sceneUrl = new URL(SCENE_PATH, window.location.origin);
      const response = await fetch(sceneUrl, { cache: "force-cache" });
      if (!response.ok) throw new Error(`Scene document returned HTTP ${response.status}`);
      const sceneDocument = parseSceneDocument(await response.text());
      runtime = await createSceneRuntime({
        container: mount,
        document: sceneDocument,
        assetBaseUrl: new URL(".", sceneUrl),
        autoPlay: false,
        controls: false,
      });
      if (disposed) {
        runtime.dispose();
        runtime = null;
        return;
      }

      const renderer = runtime.viewport.renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      bloom = new EffectComposer(renderer);
      bloom.addPass(new RenderPass(runtime.scene, runtime.camera));
      bloom.addPass(new UnrealBloomPass(
        new THREE.Vector2(Math.max(1, mount.clientWidth), Math.max(1, mount.clientHeight)),
        0.37,
        0.35,
        0.4,
      ));
      runtime.viewport.render = () => bloom.render();

      const resize = () => {
        if (!bloom || !mount.clientWidth || !mount.clientHeight) return;
        bloom.setSize(mount.clientWidth, mount.clientHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      };
      resizeHandler = resize;
      window.addEventListener("resize", resize, { passive: true });
      if ("ResizeObserver" in window) {
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(mount);
      }
      resize();

      const sweep = sceneDocument.animations.find((animation) => animation.id === "circuit-expansion");
      if (!sweep) throw new Error("The authored circuit-expansion timeline is missing.");
      const radiusTrack = sweep.tracks.find((track) => track.property === "material.revealRadius");
      if (!radiusTrack) throw new Error("The authored radial reveal track is missing.");
      const idleRadius = sceneDocument.materials.find((material) => material.id === "circuit-traces")?.radialReveal?.initialRadius ?? 50;

      const hoverOn = () => {
        if (!runtime || reducedMotion.matches) return;
        if (releaseFrame) cancelAnimationFrame(releaseFrame);
        releaseFrame = 0;
        clearTimeout(touchStopTimer);
        setState("active");
        runtime.play(sweep.id, { restart: true });
      };

      const hoverOff = () => {
        if (!runtime) return;
        if (releaseFrame) cancelAnimationFrame(releaseFrame);
        clearTimeout(touchStopTimer);
        const from = Number(sampleAnimationTrack(radiusTrack, runtime.currentTime));
        runtime.pause();
        setState("returning");
        const startedAt = performance.now();
        const tick = (now) => {
          const progress = Math.min(1, (now - startedAt) / 380);
          const eased = progress * progress * (3 - 2 * progress);
          runtime.setRevealRadius("circuit-traces", from + (idleRadius - from) * eased);
          if (progress < 1) {
            releaseFrame = requestAnimationFrame(tick);
          } else {
            releaseFrame = 0;
            setState("idle");
          }
        };
        releaseFrame = requestAnimationFrame(tick);
      };

      const activateOnce = () => {
        if (reducedMotion.matches) return;
        hoverOn();
        touchStopTimer = window.setTimeout(hoverOff, sweep.duration * 1000);
      };

      eventController = new AbortController();
      const { signal } = eventController;
      stage.addEventListener("pointerenter", (event) => {
        if (event.pointerType !== "touch") hoverOn();
      }, { signal });
      stage.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") hoverOff();
      }, { signal });
      stage.addEventListener("click", (event) => {
        if (event.detail !== 0) activateOnce();
      }, { signal });
      stage.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activateOnce();
        }
      }, { signal });

      runtime.render();
      setState("idle");
      stage.dataset.status = "ready";
      stage.classList.add("is-ready");
      window.__primeTechCircuitScenes ||= [];
      window.__primeTechCircuitScenes.push({ runtime, document: sceneDocument, hoverOn, hoverOff, stage, dispose });
      window.addEventListener("pagehide", dispose, { once: true });
    } catch (error) {
      stage.dataset.status = "error";
      errorMessage.hidden = false;
      errorMessage.textContent = `Native circuit scene could not load: ${error instanceof Error ? error.message : String(error)}`;
      console.error("[PrimeTech] Native circuit scene failed to load", error);
    }
  }

  mountScene();
}

function boot() {
  document.querySelectorAll("[data-primetech-circuit]").forEach(mountCircuit);
}
if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  const observer = new MutationObserver(boot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
