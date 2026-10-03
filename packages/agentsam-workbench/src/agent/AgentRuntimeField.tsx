import { useEffect, useRef, type CSSProperties } from 'react';
import type {
  LoadingSceneController,
  ScenePreset,
} from '@inneranimalmedia/agentsam-loading-scene';
import {
  HyperspaceRenderer,
  computationalHyperspace,
} from '@inneranimalmedia/agentsam-loading-scene';
import {
  LoadingSceneNarration,
  useLoadingScene,
} from '@inneranimalmedia/agentsam-loading-scene/react';

export type AgentRuntimeFieldProps = {
  controller: LoadingSceneController;
  preset?: ScenePreset;
  blocking?: boolean;
  className?: string;
  style?: CSSProperties;
  activeOpacity?: number;
  passiveOpacity?: number;
  narration?: boolean;
  narrationStyle?: CSSProperties;
};

/**
 * Reusable workbench runtime surface.
 *
 * Product apps own runtime state and event production. This primitive owns the
 * presentation contract: one persistent semantic scene, task-aware narration,
 * resize handling and blocking/non-blocking composition.
 */
export function AgentRuntimeField({
  controller,
  preset = computationalHyperspace,
  blocking = false,
  className,
  style,
  activeOpacity = 1,
  passiveOpacity = 0.34,
  narration = true,
  narrationStyle,
}: AgentRuntimeFieldProps) {
  const scene = useLoadingScene(controller);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<HyperspaceRenderer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const renderer = new HyperspaceRenderer(preset, {
      canvas,
      reducedMotion: 'auto',
    });
    rendererRef.current = renderer;

    const fit = () => renderer.setSize(host.clientWidth, host.clientHeight);
    fit();

    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(host);
    renderer.setScene(controller.getScene());

    return () => {
      observer?.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [controller, preset]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.setScene(scene);
    if (
      scene.status === 'running' ||
      scene.status === 'waiting' ||
      scene.status === 'error'
    ) {
      renderer.resume();
      return;
    }

    const timeout = window.setTimeout(
      () => renderer.suspend(),
      preset.transition.settleMs + 300,
    );
    return () => window.clearTimeout(timeout);
  }, [scene, preset]);

  const active =
    blocking ||
    scene.status === 'running' ||
    scene.status === 'waiting' ||
    scene.status === 'error';

  return (
    <div
      ref={hostRef}
      data-agent-runtime-field=""
      aria-hidden={active ? undefined : true}
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: blocking ? 'auto' : 'none',
        opacity: active ? 1 : 0,
        transition: 'opacity 500ms ease',
        background: blocking ? preset.palette.canvas : 'transparent',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: blocking ? activeOpacity : passiveOpacity,
        }}
      />

      {active && narration ? (
        <LoadingSceneNarration
          controller={controller}
          preset={preset}
          align={blocking ? 'center' : 'start'}
          showStudy
          showMeta
          style={{
            position: 'absolute',
            left: blocking ? '50%' : 18,
            top: blocking ? '50%' : 'auto',
            bottom: blocking ? 'auto' : 18,
            transform: blocking ? 'translate(-50%, -50%)' : undefined,
            pointerEvents: 'none',
            ...narrationStyle,
          }}
        />
      ) : null}
    </div>
  );
}
