const DEFAULT_MAILBOXES = [
  {
    id: "mb_sam",
    address: "sam@fuelnfreetime.com",
    label: "Sam",
    kind: "personal",
    owner_name: "Sam Primeaux",
    owner_auth_email: "info@inneranimals.com",
    owner_user_id: null,
    resend_from_name: "Sam Primeaux",
    access_json: "{}",
    sort_order: 10,
  },
  {
    id: "mb_connor",
    address: "connor@fuelnfreetime.com",
    label: "Connor",
    kind: "personal",
    owner_name: "Connor McNeely",
    owner_auth_email: "connordmcneely@leadershiplegacydigital.com",
    owner_user_id: null,
    resend_from_name: "Connor McNeely",
    access_json: "{}",
    sort_order: 20,
  },
  {
    id: "mb_payments",
    address: "payments@fuelnfreetime.com",
    label: "Payments",
    kind: "payments",
    owner_name: "Fuel & Free Time",
    owner_auth_email: null,
    owner_user_id: null,
    resend_from_name: "Fuel & Free Time Payments",
    access_json: '{"roles":["owner"],"emails":["info@inneranimals.com"]}',
    sort_order: 30,
  },
];

function parseAccess(box) {
  try {
    const raw = typeof box.access_json === "string" ? JSON.parse(box.access_json || "{}") : box.access_json || {};
    return {
      roles: Array.isArray(raw.roles) ? raw.roles : [],
      emails: Array.isArray(raw.emails) ? raw.emails.map((e) => e.toLowerCase()) : [],
    };
  } catch {
    return { roles: [], emails: [] };
  }
}

export function canAccessMailbox(box, user) {
  if (!user || !box) return false;
  const email = (user.email || "").toLowerCase();
  if (box.owner_user_id && box.owner_user_id === user.id) return true;
  if (box.owner_auth_email && box.owner_auth_email.toLowerCase() === email) return true;
  const access = parseAccess(box);
  if (access.emails.includes(email)) return true;
  if (user.role && access.roles.includes(user.role)) return true;
  return false;
}

export async function listMailboxes(env) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, address, label, kind, owner_name, owner_auth_email, owner_user_id,
              resend_from_name, is_default_send, sort_order, access_json
       FROM mail_mailboxes
       ORDER BY sort_order ASC, address ASC`
    ).all();
    if (results?.length) return results;
  } catch {
    /* table may not exist */
  }
  return DEFAULT_MAILBOXES;
}

export async function getMailboxesForUser(env, user) {
  const all = await listMailboxes(env);
  if (!user) return [];
  return all.filter((box) => canAccessMailbox(box, user));
}

export async function getPrimaryMailboxForUser(env, user) {
  const boxes = await getMailboxesForUser(env, user);
  const personal = boxes.find(
    (b) =>
      b.kind === "personal" &&
      (b.owner_user_id === user.id ||
        (b.owner_auth_email && b.owner_auth_email.toLowerCase() === user.email.toLowerCase()))
  );
  return personal || boxes[0] || null;
}

export async function getMailboxBySlug(env, slug) {
  if (!slug || slug === "all") return null;
  const boxes = await listMailboxes(env);
  const normalized = String(slug).toLowerCase();
  return (
    boxes.find((b) => b.id === slug) ||
    boxes.find((b) => b.address.split("@")[0].toLowerCase() === normalized) ||
    boxes.find((b) => b.id === `mb_${normalized}`) ||
    null
  );
}

export async function assertMailboxAccess(env, user, slug) {
  if (!slug) return { mailbox: await getPrimaryMailboxForUser(env, user), forbidden: false };
  const mailbox = await getMailboxBySlug(env, slug);
  if (!mailbox) return { mailbox: null, forbidden: true };
  if (!canAccessMailbox(mailbox, user)) return { mailbox, forbidden: true };
  return { mailbox, forbidden: false };
}

/** Match inbound/outbound row to a mailbox address (local-part or full address). */
export function matchMailboxForMessage(row, mailboxes) {
  const hay = `${row.to_email || ""} ${row.from_email || ""}`.toLowerCase();
  for (const box of mailboxes) {
    const addr = box.address.toLowerCase();
    const local = addr.split("@")[0];
    if (hay.includes(addr) || hay.includes(`${local}@`)) return box;
  }
  return null;
}

export function mailboxSlug(box) {
  return box?.address?.split("@")[0] || null;
}
