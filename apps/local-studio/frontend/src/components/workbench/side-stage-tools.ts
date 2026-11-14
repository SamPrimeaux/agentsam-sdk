import { Box, Database, FileCode, Film, Globe, Layers, LayoutGrid, SquareTerminal, Target, Users } from "lucide-react";

/**
 * Native Side Stage tools. Available even when optional plugin discovery is
 * offline; only installed plugin entries come from the account registry.
 */
export const NATIVE_STAGE_ITEMS = [
  { kind: "apps", label: "App library", icon: LayoutGrid },
  { kind: "chat", label: "Co-worker", icon: Users },
  { kind: "browser", label: "Browser", icon: Globe },
  { kind: "files", label: "Files", icon: FileCode },
  { kind: "artifacts", label: "Artifacts", icon: Box },
  { kind: "design", label: "Canvas", icon: Layers },
  { kind: "media", label: "MovieMode", icon: Film },
  { kind: "database", label: "Database", icon: Database },
  { kind: "terminal", label: "Terminal", icon: SquareTerminal },
  { kind: "goal", label: "Goals", icon: Target },
] as const;
