export type Role = "user" | "assistant" | "system";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
};

export type Trail = {
  id: string;
  title: string;
  projectId: string;
  pinned: boolean;
  messages: ChatMessage[];
  updatedAt: number;
  createdAt: number;
};

export type WorkFile = {
  id: string;
  path: string;
  language: string;
  content: string;
};

export type SideKind = "chat" | "browser" | "files" | "artifacts" | "ship";

export type SideTab = {
  id: string;
  kind: SideKind;
  title: string;
  ephemeral?: boolean;
  parentTrailId?: string | null;
  messages: ChatMessage[];
  url: string;
  history: string[];
  historyIndex: number;
  fileId?: string | null;
};

export type AgentStep = {
  id: string;
  label: string;
  done: boolean;
};
