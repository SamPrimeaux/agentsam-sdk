export const AGENT_HOME_PATH = "/";
export const AGENT_WORK_PATH = "/trails";
export const AGENT_TRAIL_PATH = "/trails/$trailId";
export const AGENT_PROJECTS_PATH = "/projects";
export const AGENT_EXPLORE_PATH = "/explore";

export function isAgentWorkPath(pathname: string) {
  return pathname === AGENT_WORK_PATH || pathname.startsWith("/trails/");
}
