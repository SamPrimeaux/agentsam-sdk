import { localStudioSettingsManifest } from "./localStudioSettingsManifest";

/** Display name for a settings pane, read from the manifest so labels never drift from Settings. */
export function settingsPaneLabel(unitId: string, viewId?: string): string {
  const unit = localStudioSettingsManifest.units.find((candidate) => candidate.id === unitId);
  const view = viewId ? unit?.views?.find((candidate) => candidate.id === viewId) : undefined;
  return view?.label ?? unit?.label ?? "Settings";
}
