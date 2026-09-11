export type Role = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type ArtifactKind = "code" | "preview" | "deploy" | "log" | "bundle";

export type ArtifactOrigin = "chat" | "editor" | "terminal" | "seed" | "deploy";

export type Artifact = {
  id: string;
  path: string;
  language: string;
  content: string;
  updatedAt: number;
  kind?: ArtifactKind;
  origin?: ArtifactOrigin;
  title?: string;
  url?: string;
  trailId?: string;
};

export type GitRemote = { name: string; url: string };

export type GitCommit = {
  id: string;
  message: string;
  at: number;
  paths: string[];
};

export type GitState = {
  initialized: boolean;
  branch: string;
  remotes: GitRemote[];
  commits: GitCommit[];
  staged: string[];
  snapshots: Record<string, Record<string, string>>;
};

export type DeployTarget = {
  githubOwner: string;
  githubRepo: string;
  githubBranch: string;
  cloudflareAccountId: string;
  cloudflareProject: string;
  lastGithubUrl?: string;
  lastGithubAt?: number;
  lastCloudflareUrl?: string;
  lastCloudflareAt?: number;
};

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  files: Artifact[];
  dirs: string[];
  git: GitState;
  deploy: DeployTarget;
  cwd: string;
};

export type Trail = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  messages: ChatMessage[];
  files: Artifact[];
  projectId: string;
};

export type SideKind = "chat" | "browser" | "files" | "terminal" | "artifacts" | "deploy";

export type SideTab = {
  id: string;
  kind: SideKind;
  title: string;
  ephemeral: boolean;
  messages: ChatMessage[];
  parentTrailId: string | null;
  keptTrailId: string | null;
  url: string;
  srcdoc: string | null;
  fileId: string | null;
  /** In-app browser history stack (URLs only; srcdoc previews skip history). */
  history: string[];
  historyIndex: number;
  /** Co-worker chats report a brief into the lead chat when a reply finishes. */
  reportToLead: boolean;
};

export type ChatTarget = { kind: "trail"; id: string } | { kind: "side"; id: string };

export type NavView = "trails" | "projects" | "artifacts";

export type OfflineQueuedSend = {
  id: string;
  targetId: string;
  targetKind: "trail" | "side";
  text: string;
  noteId: string;
  createdAt: number;
};

export type ShellEffect =
  | { type: "clear" }
  | { type: "open-file"; path: string }
  | { type: "open-browser"; url?: string; srcdoc?: string; title?: string }
  | { type: "vibe"; prompt: string }
  | { type: "github-push"; message: string }
  | { type: "cloudflare-deploy" }
  | { type: "cloudflare-whoami" }
  | { type: "download-zip" }
  | { type: "set-secret"; key: "githubToken" | "cloudflareToken"; value: string };
