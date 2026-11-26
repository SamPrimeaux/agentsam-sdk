const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'AgentSam-Local-Studio',
};

/** @param {string} accessToken */
export async function fetchGithubProfile(accessToken) {
  try {
    const [userRes, emailRes] = await Promise.all([
      fetch(GITHUB_USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, ...GITHUB_HEADERS },
      }),
      fetch(GITHUB_EMAILS_URL, {
        headers: { Authorization: `Bearer ${accessToken}`, ...GITHUB_HEADERS },
      }),
    ]);
    if (!userRes.ok) {
      const detail = (await userRes.text()).slice(0, 500);
      console.error('github_userinfo_failed', {
        status: userRes.status,
        requestId: userRes.headers.get('x-github-request-id'),
        detail,
      });
      return null;
    }
    const user = await userRes.json();
    let email = null;
    let emailVerified = false;
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = Array.isArray(emails) ? emails.find((e) => e?.primary) : null;
      email = primary?.email || null;
      emailVerified = !!primary?.verified;
    } else {
      console.warn('github_user_emails_failed', {
        status: emailRes.status,
        requestId: emailRes.headers.get('x-github-request-id'),
      });
    }
    return { ...user, email, email_verified: emailVerified };
  } catch {
    return null;
  }
}
