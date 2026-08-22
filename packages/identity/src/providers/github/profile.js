const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_EMAILS_URL = 'https://api.github.com/user/emails';

const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
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
    if (!userRes.ok) return null;
    const user = await userRes.json();
    let email = null;
    let emailVerified = false;
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = Array.isArray(emails) ? emails.find((e) => e?.primary) : null;
      email = primary?.email || null;
      emailVerified = !!primary?.verified;
    }
    return { ...user, email, email_verified: emailVerified };
  } catch {
    return null;
  }
}
