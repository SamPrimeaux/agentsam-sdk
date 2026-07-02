/**
 * Persist SDK session token locally for repeat inits (user's machine only).
 */
import fs from 'fs';
import path from 'path';

export function saveSdkTokenHint(cwd, token) {
  const t = String(token || '').trim();
  if (!t || !t.startsWith('sdk_')) return null;
  const dir = path.join(path.resolve(cwd), '.agentsam');
  fs.mkdirSync(dir, { recursive: true });
  const hintPath = path.join(dir, 'credentials.env.example');
  const content = `# Agent Sam SDK — add to your shell profile (optional)
export AGENTSAM_SDK_TOKEN=${t}
export USER_GCP_PROJECT=YOUR_GCP_PROJECT_ID
`;
  fs.writeFileSync(hintPath, content, 'utf8');
  return hintPath;
}
