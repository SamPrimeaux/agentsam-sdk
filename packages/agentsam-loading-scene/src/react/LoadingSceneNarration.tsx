import type { CSSProperties } from "react";
import type { LoadingSceneController } from "../core/controller.js";
import type { ScenePreset } from "../core/types.js";
import {
  HYPERSPACE_STUDIES,
  studyForScene,
} from "../renderer/study-selection.js";
import { useLoadingScene } from "./useLoadingScene.js";

export interface LoadingSceneNarrationProps {
  controller: LoadingSceneController;
  preset: ScenePreset;
  style?: CSSProperties;
  align?: "start" | "center";
  showStudy?: boolean;
  showMeta?: boolean;
  maxWidth?: number | string;
}

/**
 * Human-readable runtime commentary for a LoadingScene.
 *
 * The renderer remains decorative. This channel shows truthful task labels,
 * runtime-supplied detail, concurrency and measurable progress while the
 * semantic scene changes behind it.
 */
export function LoadingSceneNarration({
  controller,
  preset,
  style,
  align = "center",
  showStudy = true,
  showMeta = true,
  maxWidth = 520,
}: LoadingSceneNarrationProps) {
  const scene = useLoadingScene(controller);
  if (scene.status === "idle" && !scene.label) return null;

  const studyId = studyForScene(scene);
  const study = HYPERSPACE_STUDIES.find((item) => item.id === studyId);
  const metadata: string[] = [];

  if (scene.secondary) metadata.push(scene.secondary);
  if (scene.metricPoints && scene.metricPoints.total > 0) {
    metadata.push(`${scene.metricPoints.completed} / ${scene.metricPoints.total} points`);
  }
  if (typeof scene.progress === "number") {
    metadata.push(`${Math.round(scene.progress * 100)}%`);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        width: "min(100%, 680px)",
        maxWidth,
        color: preset.palette.text,
        fontFamily:
          'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif',
        display: "flex",
        flexDirection: "column",
        alignItems: align === "center" ? "center" : "flex-start",
        textAlign: align === "center" ? "center" : "left",
        gap: 7,
        textShadow: "0 2px 18px rgba(0,0,0,.92)",
        ...style,
      }}
    >
      {showStudy && study ? (
        <span
          style={{
            color: "rgba(181,177,192,.78)",
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {study.title}
        </span>
      ) : null}

      <span
        style={{
          color: preset.palette.text,
          fontSize: "clamp(14px, 1.6vw, 19px)",
          lineHeight: 1.22,
          fontWeight: 560,
          letterSpacing: "-0.012em",
        }}
      >
        {scene.label}
      </span>

      {scene.detail ? (
        <span
          style={{
            color: "rgba(181,177,192,.88)",
            fontSize: 12,
            lineHeight: 1.45,
            maxWidth: "100%",
          }}
        >
          {scene.detail}
        </span>
      ) : null}

      {showMeta && metadata.length ? (
        <span
          style={{
            color: "rgba(181,177,192,.56)",
            fontSize: 10,
            lineHeight: 1.35,
            letterSpacing: "0.035em",
          }}
        >
          {metadata.join(" · ")}
        </span>
      ) : null}

      {typeof scene.progress === "number" ? (
        <span
          aria-hidden="true"
          style={{
            display: "block",
            width: align === "center" ? 180 : "min(240px, 100%)",
            height: 1,
            marginTop: 3,
            overflow: "hidden",
            background: "rgba(181,177,192,.16)",
          }}
        >
          <span
            style={{
              display: "block",
              width: `${Math.max(0, Math.min(1, scene.progress)) * 100}%`,
              height: "100%",
              background: preset.palette.accents[0],
              boxShadow: `0 0 12px ${preset.palette.accents[0]}`,
              transition: "width 220ms ease",
            }}
          />
        </span>
      ) : null}
    </div>
  );
}
