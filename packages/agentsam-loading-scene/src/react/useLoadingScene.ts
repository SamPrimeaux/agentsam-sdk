import { useEffect, useState } from "react";
import type { LoadingSceneController } from "../core/controller.js";
import type { SceneState } from "../core/types.js";

export function useLoadingScene(controller: LoadingSceneController): SceneState {
  const [scene, setScene] = useState<SceneState>(() => controller.getScene());
  useEffect(() => controller.subscribe(setScene), [controller]);
  return scene;
}
