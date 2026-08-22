export function newAuthUserId() {
  return `au_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function newAccountIdentityId() {
  return `aid_${crypto.randomUUID().replace(/-/g, '')}`;
}

export function newSessionId() {
  return crypto.randomUUID();
}

export function nowUnix() {
  return Math.floor(Date.now() / 1000);
}
