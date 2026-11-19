export type ShellAppearance = { theme: "light" | "dark"; accent: string };
type Preference = { theme: "light" | "dark" | "system"; accent: string };
const STORAGE_KEY = "agentsam-shell-appearance-v1";

function readPreference(): Preference | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Preference>;
    if (!["light", "dark", "system"].includes(value.theme || "")) return null;
    if (typeof value.accent !== "string" || !/^#[0-9a-f]{6}$/i.test(value.accent)) return null;
    return { theme: value.theme as Preference["theme"], accent: value.accent };
  } catch {
    return null;
  }
}

function resolve(preference: Preference | null, systemLight: boolean): ShellAppearance {
  const value = preference || { theme: "system" as const, accent: "#2563EB" };
  return {
    theme: value.theme === "system" ? (systemLight ? "light" : "dark") : value.theme,
    accent: value.accent,
  };
}

export function observeShellAppearance(apply: (appearance: ShellAppearance) => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: light)");
  const update = () => apply(resolve(readPreference(), media.matches));
  update();
  window.addEventListener("agentsam:shell-appearance", update);
  window.addEventListener("storage", update);
  media.addEventListener("change", update);
  return () => {
    window.removeEventListener("agentsam:shell-appearance", update);
    window.removeEventListener("storage", update);
    media.removeEventListener("change", update);
  };
}
