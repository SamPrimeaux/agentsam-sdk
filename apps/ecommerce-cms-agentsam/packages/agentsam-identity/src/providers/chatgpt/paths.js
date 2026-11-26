import {
  CHATGPT_CALLBACK_PATH,
  CHATGPT_SIGN_IN_PATH,
  CHATGPT_SIGN_OUT_PATH,
} from './headers.js';

function isReservedAuthPath(pathname) {
  return (
    pathname === CHATGPT_SIGN_IN_PATH ||
    pathname === CHATGPT_SIGN_OUT_PATH ||
    pathname === CHATGPT_CALLBACK_PATH
  );
}

/** Safe relative return path for ChatGPT hosted sign-in/out redirects. */
export function safeRelativeReturnPath(value) {
  const raw = String(value || '/');
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';

  let url;
  try {
    url = new URL(raw, 'https://app.local');
  } catch {
    return '/';
  }
  if (url.origin !== 'https://app.local') return '/';
  if (isReservedAuthPath(url.pathname)) return '/';
  return `${url.pathname}${url.search}${url.hash}`;
}

export function chatGPTSignInPath(returnTo = '/') {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${CHATGPT_SIGN_IN_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export function chatGPTSignOutPath(returnTo = '/') {
  const safeReturnTo = safeRelativeReturnPath(returnTo);
  return `${CHATGPT_SIGN_OUT_PATH}?return_to=${encodeURIComponent(safeReturnTo)}`;
}

export {
  CHATGPT_SIGN_IN_PATH,
  CHATGPT_SIGN_OUT_PATH,
  CHATGPT_CALLBACK_PATH,
};
