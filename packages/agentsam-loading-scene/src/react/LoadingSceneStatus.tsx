import type { CSSProperties } from "react";
import type { LoadingSceneController } from "../core/controller.js";
import type { ScenePreset } from "../core/types.js";
import { useLoadingScene } from "./useLoadingScene.js";

export interface LoadingSceneStatusProps {
  controller: LoadingSceneController;
  preset: ScenePreset;
  style?: CSSProperties;
}

/**
 * The accessible truth channel. The canvas is decorative; this small
 * DOM label carries real state. aria-live announces meaningful phase
 * changes only (label updates are already throttled upstream).
 */
export function LoadingSceneStatus({ controller, preset, style }: LoadingSceneStatusProps) {
  const scene = useLoadingScene(controller);
  if (scene.status === "idle" && !scene.label) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        fontFamily: "system-ui, sans-serif",
        fontSize: 13,
        letterSpacing: "0.04em",
        color: preset.palette.text,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        ...style,
      }}
    >
      <span>{scene.label}</span>
      {scene.detail ? (
        <span style={{ opacity: 0.72, fontSize: 11 }}>{scene.detail}</span>
      ) : null}
      {scene.secondary ? (
        <span style={{ opacity: 0.55, fontSize: 11 }}>{scene.secondary}</span>
      ) : null}
      {typeof scene.progress === "number" ? (
        <span style={{ opacity: 0.55, fontSize: 11 }}>{Math.round(scene.progress * 100)}%</span>
      ) : null}
    </div>
  );
}
