/**
 * Team + mailbox provisioning (Resend-only — no Gmail forwarding).
 */

import { hashPassword, newAuthUserId } from "../lib/auth.js";
import { resolveApplicationAccountId } from "../lib/account-context.js";
import { listMailboxes, getMailboxBySlug } from "../lib/mail-mailboxes.js";


function requireAdmin(user) {
  if (!user || !["owner", "admin"].includes(user.role)) {
    return Response.json({ error: "Admin access required" }, { status: 403 });
  }
  return null;
}

function initialsFrom(name, email) {
  const base = (name || email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function slugifyLocalPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 32);
}

export async function listTeamMembers(env, user) {
  const denied = requireAdmin(user);
  if (denied) return denied;

  const accountId = await resolveApplicationAccountId(env, user?.account_id || null);
  if (!accountId) {
    return Response.json({ error: "application_account_not_configured" }, { status: 503 });
  }

  const { results: members } = await env.DB.prepare(
    `SELECT u.id, u.email, u.display_name, u.name, m.role, u.avatar_url, u.status,
            u.created_at, u.last_login_at
     FROM account_memberships m
     JOIN auth_users u ON u.id = m.user_id
     WHERE m.account_id = ? AND u.status = 'active'
     ORDER BY u.display_name ASC, u.email ASC`
  )
    .bind(accountId)
    .all();

  const mailboxes = await listMailboxes(env);

  return Response.json({
    ok: true,
    members: (members || []).map((m) => ({
      ...m,
      initials: initialsFrom(m.display_name || m.name, m.email),
      mailboxes: mailboxes
        .filter(
          (box) =>
            box.owner_user_id === m.id ||
            (box.owner_auth_email &&
              box.owner_auth_email.toLowerCase() === m.email.toLowerCase())
        )
        .map((box) => box.address),
    })),
  });
}

export async function inviteTeamMember(request, env, user) {
  const denied = requireAdmin(user);
  if (denied) return denied;

  const accountId = await resolveApplicationAccountId(env, user?.account_id || null);
  if (!accountId) {
    return Response.json({ error: "application_account_not_configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.email || !body?.password) {
    return Response.json({ error: "email and password required" }, { status: 400 });
  }

  const email = String(body.email).trim().toLowerCase();
  const role = String(body.role || "member").toLowerCase();
  const displayName = String(body.display_name || body.name || email.split("@")[0]).trim();
  const localPart = slugifyLocalPart(body.mailbox_local || body.local_part || displayName.split(" ")[0]);
  const mailboxLabel = String(body.mailbox_label || displayName).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Invalid login email" }, { status: 400 });
  }
  if (body.password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!localPart) {
    return Response.json({ error: "mailbox_local required" }, { status: 400 });
  }

  const { hash, salt } = await hashPassword(body.password);
  const id = newAuthUserId();
  const { getCompanyDomain } = await import("../lib/company.js");
  const domain = await getCompanyDomain(env);
  if (!domain) {
    return Response.json({ error: "company_domain_not_configured" }, { status: 503 });
  }
  const address = `${localPart}@${domain}`;

  const existingBox = await env.DB.prepare(`SELECT id FROM mail_mailboxes WHERE address = ?`)
    .bind(address)
    .first();
  if (existingBox) {
    return Response.json({ error: `${address} already exists` }, { status: 409 });
  }

  await env.DB.prepare(
    `INSERT INTO auth_users (
       id, email, name, password_hash, salt, role, display_name,
       default_account_id, is_verified, verified_at, status, timezone, account_type, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, unixepoch(), 'active', 'America/Chicago', 'human', datetime('now'))
     ON CONFLICT(email) DO UPDATE SET
       password_hash = excluded.password_hash,
       salt = excluded.salt,
       role = excluded.role,
       name = excluded.name,
       display_name = excluded.display_name,
       default_account_id = excluded.default_account_id,
       updated_at = datetime('now')`
  )
    .bind(
      id,
      email,
      displayName,
      hash,
      salt,
      role,
      displayName,
      accountId
    )
    .run();

  const userRow = await env.DB.prepare(`SELECT id FROM auth_users WHERE email = ?`).bind(email).first();
  const userId = userRow?.id || id;

  await env.DB.prepare(
    `INSERT INTO account_memberships (account_id, user_id, role)
     VALUES (?, ?, ?)
     ON CONFLICT(account_id, user_id) DO UPDATE SET role = excluded.role`
  )
    .bind(accountId, userId, role)
    .run();

  const mailboxId = `mb_${localPart}`;

  await env.DB.prepare(
    `INSERT INTO mail_mailboxes (
       id, address, label, kind, owner_name, owner_auth_email, owner_user_id,
       resend_from_name, access_json, sort_order
     ) VALUES (?, ?, ?, 'personal', ?, ?, ?, ?, '{}', 100)
     ON CONFLICT(id) DO UPDATE SET
       address = excluded.address,
       label = excluded.label,
       owner_name = excluded.owner_name,
       owner_auth_email = excluded.owner_auth_email,
       owner_user_id = excluded.owner_user_id,
       resend_from_name = excluded.resend_from_name`
  )
    .bind(
      mailboxId,
      address,
      mailboxLabel,
      displayName,
      email,
      userId,
      displayName
    )
    .run();

  return Response.json({
    ok: true,
    user_id: userId,
    email,
    mailbox: address,
    message: `Invited ${displayName}. Login: ${email} · Inbox: ${address}`,
  });
}

export async function createMailbox(request, env, user) {
  const denied = requireAdmin(user);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const localPart = slugifyLocalPart(body?.local_part);
  const label = String(body?.label || localPart).trim();
  const kind = String(body?.kind || "shared").toLowerCase();
  const ownerUserId = body?.owner_user_id || null;
  const access = body?.access || { roles: ["owner", "admin"] };

  if (!localPart) {
    return Response.json({ error: "local_part required" }, { status: 400 });
  }

  const { getCompanyDomain } = await import("../lib/company.js");
  const domain = await getCompanyDomain(env);
  if (!domain) {
    return Response.json({ error: "company_domain_not_configured" }, { status: 503 });
  }
  const address = `${localPart}@${domain}`;
  const existing = await getMailboxBySlug(env, localPart);
  if (existing) {
    return Response.json({ error: `${address} already exists` }, { status: 409 });
  }

  let ownerName = label;
  let ownerEmail = null;
  if (ownerUserId) {
    const owner = await env.DB.prepare(`SELECT email, display_name, name FROM auth_users WHERE id = ?`)
      .bind(ownerUserId)
      .first();
    if (owner) {
      ownerName = owner.display_name || owner.name || label;
      ownerEmail = owner.email;
    }
  }

  const id = `mb_${localPart}`;
  await env.DB.prepare(
    `INSERT INTO mail_mailboxes (
       id, address, label, kind, owner_name, owner_auth_email, owner_user_id,
       resend_from_name, access_json, sort_order
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 200)`
  )
    .bind(
      id,
      address,
      label,
      kind,
      ownerName,
      ownerEmail,
      ownerUserId,
      `${label}`,
      JSON.stringify(access)
    )
    .run();

  return Response.json({ ok: true, mailbox: { id, address, label, kind } });
}

export async function updateAccountProfile(request, env, user) {
  const body = await request.json().catch(() => null);
  if (!body) return Response.json({ error: "Invalid body" }, { status: 400 });

  const displayName = body.display_name != null ? String(body.display_name).trim() : null;
  const avatarUrl = body.avatar_url != null ? String(body.avatar_url).trim() : null;

  if (displayName !== null) {
    await env.DB.prepare(
      `UPDATE auth_users SET display_name = ?, name = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(displayName, displayName, user.id)
      .run();
  }
  if (avatarUrl !== null) {
    await env.DB.prepare(
      `UPDATE auth_users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(avatarUrl || null, user.id)
      .run();
  }

  return Response.json({ ok: true });
}

export { initialsFrom };
