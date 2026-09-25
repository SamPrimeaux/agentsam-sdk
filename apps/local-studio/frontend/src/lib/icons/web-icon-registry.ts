/**
 * Web renderer map for agentsam.icon.v1 — Lucide only lives here, never in D1/manifests.
 */
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Brain,
  Cloud,
  Code2,
  Database,
  File,
  FileCode,
  Folder,
  Globe,
  Image,
  KeyRound,
  LayoutTemplate,
  Network,
  Orbit,
  Package,
  Palette,
  Plug,
  Puzzle,
  Search,
  Settings,
  Shield,
  Sparkles,
  SquareTerminal,
  Fingerprint,
  Circle,
  Workflow,
  BarChart3,
  HardDrive,
  Bot,
  AppWindow,
  FolderGit2,
  Wrench,
  Link2,
  Rocket,
  ScrollText,
} from "lucide-react";
import {
  createIconRenderer,
  normalizeIconKey,
} from "@agentsam/icon-registry";

/** Semantic key → Lucide component (renderer concern). */
export const WEB_ICON_REGISTRY: Partial<Record<string, LucideIcon>> = {
  generic: Circle,
  agent: Bot,
  app: AppWindow,
  project: FolderGit2,
  package: Package,
  plugin: Puzzle,
  inspect: Search,
  search: Search,
  code: Code2,
  terminal: SquareTerminal,
  browser: Globe,
  workflow: Workflow,
  database: Database,
  storage: HardDrive,
  vector: Orbit,
  data: Boxes,
  repository: FolderGit2,
  file: File,
  folder: Folder,
  document: FileCode,
  artifact: Boxes,
  image: Image,
  memory: Brain,
  model: Sparkles,
  provider: Cloud,
  tool: Wrench,
  skill: Sparkles,
  integration: Plug,
  connection: Link2,
  api: Network,
  identity: Fingerprint,
  key: KeyRound,
  security: Shield,
  network: Network,
  cloud: Cloud,
  deploy: Rocket,
  brand: LayoutTemplate,
  theme: Palette,
  settings: Settings,
  metrics: BarChart3,
  logs: ScrollText,
};

const resolveLucide = createIconRenderer(WEB_ICON_REGISTRY, Circle);

/** @returns {LucideIcon} */
export function resolveWebIcon(raw: unknown): LucideIcon {
  return resolveLucide(raw) as LucideIcon;
}

export { normalizeIconKey };
