import type { CoProProject } from "@inneranimalmedia/copro-project";

export type CoProCommand =
  | { type: "clip.insert"; payload: { trackId: string; clip: unknown } }
  | { type: "clip.move"; payload: { clipId: string; startUs: number; trackId?: string } }
  | { type: "clip.trim"; payload: { clipId: string; startUs?: number; inUs?: number; durationUs?: number } }
  | { type: "clip.split"; payload: { clipId: string; atUs: number; rightClipId: string } }
  | { type: "clip.duplicate"; payload: { clipId: string; newClipId: string; startUs?: number } }
  | { type: "clip.delete"; payload: { clipId: string } };

export declare function applyCoProCommand(project: CoProProject, command: CoProCommand): CoProProject;

export declare class CoProEditorSession {
  constructor(project: CoProProject);
  get project(): CoProProject;
  execute(command: CoProCommand): CoProProject;
  undo(): CoProProject;
  redo(): CoProProject;
  get canUndo(): boolean;
  get canRedo(): boolean;
}
