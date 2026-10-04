import type { ReactNode } from 'react';
import type {
  LoadingSceneController,
  ScenePreset,
} from '@inneranimalmedia/agentsam-loading-scene';
import {
  LoadingScene,
  LoadingSceneStatus,
  useLoadingScene,
} from '@inneranimalmedia/agentsam-loading-scene/react';

export interface AbsRuntimeSurfaceProps {
  controller: LoadingSceneController;
  preset: ScenePreset;
  children: ReactNode;
}

export function AbsRuntimeSurface({
  controller,
  preset,
  children,
}: AbsRuntimeSurfaceProps) {
  const scene = useLoadingScene(controller);

  if (scene.status === 'idle') {
    return <div className="abs-runtime-static">{children}</div>;
  }

  return (
    <div className="abs-runtime-surface">
      <LoadingScene
        controller={controller}
        preset={preset}
        reducedMotion="auto"
        className="abs-runtime-loading-scene"
      >
        {children}
      </LoadingScene>

      {(scene.status === 'running' ||
        scene.status === 'waiting' ||
        scene.status === 'error') && (
        <LoadingSceneStatus
          controller={controller}
          preset={preset}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            alignItems: 'center',
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}
