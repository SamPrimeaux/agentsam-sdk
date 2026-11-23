export interface CadThemePalette {
  background: string;
  surface: string;
  input: string;
  ink: string;
  muted: string;
  line: string;
  hover: string;
  accent: string;
  accentForeground: string;
  success: string;
  danger: string;
  warning: string;
}

/** Resolve the CAD semantic palette from the active AgentSam theme at the viewport boundary. */
export function readCadTheme(element?: Element | null): CadThemePalette {
  const styles = getComputedStyle(element || document.documentElement);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  const background = token('--cad-bg', 'Canvas');
  const surface = token('--cad-surface', 'Canvas');
  const ink = token('--cad-ink', 'CanvasText');
  const accent = token('--cad-accent', token('--nav-accent', 'Highlight'));
  return {
    background,
    surface,
    input: token('--cad-input', surface),
    ink,
    muted: token('--cad-muted', 'GrayText'),
    line: token('--cad-line', ink),
    hover: token('--cad-hover', surface),
    accent,
    accentForeground: token('--cad-accent-foreground', 'Canvas'),
    success: token('--cad-success', accent),
    danger: token('--cad-danger', ink),
    warning: token('--cad-warning', accent),
  };
}
