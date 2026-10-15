export const AGENT_HOME_PATH = "/";
export const AGENT_CHATS_PATH = "/chats";
export const AGENT_CHAT_PATH = "/chats/$chatId";
export const AGENT_PROJECTS_PATH = "/projects";
export const AGENT_EXPLORE_PATH = "/explore";

export function isAgentWorkPath(pathname: string) {
  return pathname === AGENT_CHATS_PATH || pathname.startsWith("/chats/");
}
