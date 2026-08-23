/** SDK-portable session/auth path constants. */
export const AUTH_COOKIE_NAME = 'session';
export const AUTH_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MIN_AGENT_SESSION_TTL_SECONDS = 60;
export const MAX_AGENT_SESSION_TTL_SECONDS = 86400;
export const DEFAULT_AGENT_SESSION_TTL_SECONDS = 900;
export const AUTH_LOGIN_PATH = '/auth/login';
export const AUTH_SIGNUP_PATH = '/auth/signup';
export const DASHBOARD_AFTER_LOGIN_PATH = '/dashboard/cms';
