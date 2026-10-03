<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Account — Fuel & Free Time Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/admin/css/admin.css">
<link rel="stylesheet" href="/admin/css/account-mail.css">
</head>
<body>
<script src="/admin/js/shell.js?v=20260625"></script>
<script src="/admin/js/account-settings.js?v=20260625"></script>
<script>
renderShell('/admin/account', `
<div class="account-page">
  <div>
    <h1 class="admin-page-title">Account</h1>
    <p class="admin-page-sub">Security, profile, and mail integrations for Fuel &amp; Free Time admin.</p>
  </div>

  <section class="account-section" id="security">
    <div class="account-section-head">
      <div>
        <h2>Profile &amp; security</h2>
        <p>Signed-in admin identity and password. Storefront SEO and spam controls live under Online Store preferences.</p>
      </div>
    </div>
    <div class="account-grid">
      <div class="account-card">
        <div class="account-card-title">
          <div><strong>Profile</strong><span>Shown in the sidebar and mail composer.</span></div>
        </div>
        <form id="profile-form">
          <div class="account-form-grid">
            <div class="account-field full">
              <label for="profileDisplayName">Display name</label>
              <input id="profileDisplayName" type="text" placeholder="Sam Primeaux" autocomplete="name">
            </div>
            <div class="account-field full">
              <label for="profileAvatarUrl">Avatar URL (optional)</label>
              <input id="profileAvatarUrl" type="url" placeholder="https://…" autocomplete="off">
            </div>
            <div class="account-field full">
              <label>Login email</label>
              <input id="accountEmail" type="text" readonly>
            </div>
          </div>
          <div class="account-actions" style="margin-top:12px">
            <button type="submit" class="account-btn primary">Save profile</button>
          </div>
          <div class="admin-note" id="profile-note" style="display:none;margin-top:10px"></div>
        </form>
      </div>
      <div class="account-card">
        <div class="account-card-title">
          <div><strong>Signed in as</strong><span id="accountRoleLabel">Admin access</span></div>
          <span class="account-pill connected" id="accountRole">admin</span>
        </div>
        <p style="margin:0;font-size:13px;color:#64748b">Storefront SEO and spam controls live under <a href="/admin/preferences">Online Store preferences</a>.</p>
      </div>
      <div class="account-card">
        <div class="account-card-title">
          <div><strong>Change password</strong><span>Minimum 8 characters. Applies to this admin login only.</span></div>
        </div>
        <form id="pw-form">
          <div class="account-form-grid">
            <div class="account-field full">
              <label for="current_password">Current password</label>
              <input id="current_password" type="password" required autocomplete="current-password">
            </div>
            <div class="account-field full">
              <label for="new_password">New password</label>
              <input id="new_password" type="password" required minlength="8" autocomplete="new-password">
            </div>
          </div>
          <div class="account-actions" style="margin-top:12px">
            <button type="submit" class="account-btn primary">Update password</button>
          </div>
          <div class="admin-note" id="pw-note" style="display:none;margin-top:10px"></div>
        </form>
      </div>
    </div>
  </section>

  <section class="account-section" id="team" data-admin-only>
    <div class="account-section-head">
      <div>
        <h2>Team &amp; mailboxes</h2>
        <p>Invite admins and create additional @fuelnfreetime.com addresses on Resend (no Gmail forwarding).</p>
      </div>
    </div>
    <div class="account-grid">
      <div class="account-card">
        <div class="account-card-title">
          <div><strong>Invite member</strong><span>Creates login + personal @fuelnfreetime.com inbox.</span></div>
        </div>
        <form id="invite-form">
          <div class="account-form-grid">
            <div class="account-field full"><label for="inviteEmail">Login email</label><input id="inviteEmail" type="email" required placeholder="name@company.com"></div>
            <div class="account-field"><label for="inviteName">Display name</label><input id="inviteName" required placeholder="First Last"></div>
            <div class="account-field"><label for="inviteRole">Role</label><select id="inviteRole"><option value="admin">Admin</option><option value="member">Member</option><option value="owner">Owner</option></select></div>
            <div class="account-field"><label for="inviteMailbox">Mailbox local part</label><input id="inviteMailbox" required placeholder="sam" pattern="[a-z0-9._-]+"></div>
            <div class="account-field full"><label for="invitePassword">Temporary password</label><input id="invitePassword" type="password" required minlength="8" autocomplete="new-password"></div>
          </div>
          <div class="account-actions" style="margin-top:12px">
            <button type="submit" class="account-btn primary">Send invite</button>
          </div>
          <div class="admin-note" id="invite-note" style="display:none;margin-top:10px"></div>
        </form>
      </div>
      <div class="account-card">
        <div class="account-card-title">
          <div><strong>Create mailbox</strong><span>Shared or personal address on fuelnfreetime.com.</span></div>
        </div>
        <form id="mailbox-form">
          <div class="account-form-grid">
            <div class="account-field"><label for="mailboxLocal">Local part</label><input id="mailboxLocal" required placeholder="support" pattern="[a-z0-9._-]+"></div>
            <div class="account-field"><label for="mailboxLabel">Label</label><input id="mailboxLabel" required placeholder="Support"></div>
            <div class="account-field full"><label for="mailboxKind">Type</label><select id="mailboxKind"><option value="shared">Shared inbox</option><option value="personal">Personal inbox</option></select></div>
          </div>
          <div class="account-actions" style="margin-top:12px">
            <button type="submit" class="account-btn primary">Create mailbox</button>
          </div>
          <div class="admin-note" id="mailbox-note" style="display:none;margin-top:10px"></div>
        </form>
      </div>
      <div class="account-card full">
        <div class="account-card-title"><div><strong>Team members</strong><span>Active admin logins and linked mailboxes.</span></div></div>
        <div id="teamList" class="account-webhook-list"></div>
      </div>
    </div>
  </section>

  <section class="account-section" id="mail">
    <div class="account-section-head">
      <div>
        <h2>Mail (Resend)</h2>
        <p>End-to-end Resend on fuelnfreetime.com — inbound catch-all and outbound send. No Gmail sync.</p>
      </div>
      <span class="account-pill" id="accountStatusPill">Resend</span>
    </div>

    <div class="account-tabs" role="tablist" aria-label="Mail settings sections">
      <button class="account-tab active" type="button" data-mail-tab="accounts">Overview</button>
      <button class="account-tab" type="button" data-mail-tab="resend">Resend</button>
      <button class="account-tab" type="button" data-mail-tab="routing">Routing</button>
    </div>

    <div class="account-panel active" id="mail-panel-accounts">
      <div class="account-card full">
        <div class="account-card-title">
          <div><strong>@fuelnfreetime.com mailboxes</strong><span>Resend catch-all inbound routes by recipient address. Each inbox filters in Admin → Email.</span></div>
        </div>
        <div id="mailboxList" class="account-webhook-list"></div>
      </div>
      <div class="account-card full">
        <div class="account-card-title">
          <div><strong>Connected sources</strong><span>Configure providers below. API keys for Resend are stored as Worker secrets — not in the browser.</span></div>
        </div>
        <div id="accountsList"></div>
        <div class="account-actions">
          <button class="account-btn" type="button" data-mail-tab="resend">Configure Resend</button>
          <button class="account-btn primary" type="button" id="saveAllSettings">Save mail settings</button>
        </div>
      </div>
    </div>

    <div class="account-panel" id="mail-panel-resend">
      <div class="account-grid">
        <div class="account-card">
          <div class="account-card-title">
            <div><strong>Resend sender</strong><span>Order confirmations, newsletters, store notifications.</span></div>
            <span class="account-pill" id="resendStatus">Pending</span>
          </div>
          <div class="account-form-grid">
            <div class="account-field full"><label for="resendFrom">Default from email</label><input id="resendFrom" type="email" placeholder="hello@fuelnfreetime.com"></div>
            <div class="account-field full"><label for="resendPaymentsFrom">Payments from email</label><input id="resendPaymentsFrom" type="email" placeholder="payments@fuelnfreetime.com"></div>
            <div class="account-field"><label for="resendDomain">Verified domain</label><input id="resendDomain" placeholder="fuelnfreetime.com"></div>
            <div class="account-field"><label for="resendReplyTo">Reply-to</label><input id="resendReplyTo" type="email" placeholder="support@fuelnfreetime.com"></div>
            <div class="account-field full"><label for="resendApiKey">API key (optional — prefer Worker secret)</label><input id="resendApiKey" type="password" placeholder="re_••••••••••••••••" autocomplete="off"></div>
          </div>
          <div class="account-actions">
            <button class="account-btn" type="button" id="testResend">Send E2E test</button>
            <button class="account-btn primary" type="button" id="saveResend">Save Resend</button>
          </div>
        </div>
        <div class="account-card">
          <div class="account-card-title"><div><strong>Delivery controls</strong><span>Transactional first — campaigns when ready.</span></div></div>
          <div class="account-toggle-row"><div><strong>Enable transactional send</strong><span>Orders, receipts, confirmations.</span></div><label class="account-switch"><input id="resendTransactional" type="checkbox" checked><span class="slider"></span></label></div>
          <div class="account-toggle-row"><div><strong>Enable campaign send</strong><span>Newsletter and promo mail.</span></div><label class="account-switch"><input id="resendCampaign" type="checkbox"><span class="slider"></span></label></div>
          <div class="account-toggle-row"><div><strong>Track opens and clicks</strong><span>Only when policy allows.</span></div><label class="account-switch"><input id="resendTracking" type="checkbox"><span class="slider"></span></label></div>
          <div class="account-toggle-row"><div><strong>Webhook status sync</strong><span>Delivery, bounce, complaint events.</span></div><label class="account-switch"><input id="resendWebhooks" type="checkbox" checked><span class="slider"></span></label></div>
        </div>
        <div class="account-card full">
          <div class="account-card-title"><div><strong>Resend webhooks</strong><span>Create two endpoints in the Resend dashboard.</span></div></div>
          <div class="account-webhook-list">
            <div class="account-webhook-row">
              <div><strong>Outbound</strong> <span id="webhookOutboundStatus">Not configured</span></div>
              <code id="webhookOutboundUrl">https://fuelnfreetime.com/api/webhooks/resend/outbound</code>
            </div>
            <div class="account-webhook-row">
              <div><strong>Inbound</strong> <span id="webhookInboundStatus">Not configured</span></div>
              <code id="webhookInboundUrl">https://fuelnfreetime.com/api/webhooks/resend/inbound</code>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="account-panel" id="mail-panel-routing">
      <div class="account-card full">
        <div class="account-card-title"><div><strong>Default routing</strong><span>How inbox, replies, and store mail flow.</span></div></div>
        <div class="account-form-grid">
          <div class="account-field"><label for="defaultInbox">Inbox source</label><select id="defaultInbox"><option>Resend inbound</option></select></div>
          <div class="account-field"><label for="defaultSender">Default sender</label><select id="defaultSender"><option>Resend only</option><option>Mailbox address</option></select></div>
          <div class="account-field"><label for="syncCadence">Refresh</label><select id="syncCadence"><option>Live (webhooks)</option><option>Manual reload</option></select></div>
          <div class="account-field"><label for="agentMode">Inbox assistant</label><select id="agentMode"><option>Draft only</option><option>Suggest actions</option><option>Triage and draft</option></select></div>
        </div>
        <div class="account-toggle-row"><div><strong>Auto-label platform notices</strong><span>Cloudflare, Stripe, Shopify, etc.</span></div><label class="account-switch"><input id="autoLabel" type="checkbox" checked><span class="slider"></span></label></div>
        <div class="account-toggle-row"><div><strong>Surface customer messages first</strong><span>Orders and subscribers above promos.</span></div><label class="account-switch"><input id="clientPriority" type="checkbox" checked><span class="slider"></span></label></div>
        <div class="account-toggle-row"><div><strong>Require review before send</strong><span>Drafts until approved.</span></div><label class="account-switch"><input id="reviewBeforeSend" type="checkbox" checked><span class="slider"></span></label></div>
        <div class="account-actions"><button class="account-btn primary" type="button" id="saveRouting">Save routing</button></div>
      </div>
    </div>
  </section>
</div>
<div class="account-toast" id="accountToast" role="status"></div>
`, {
  onReady: () => {
    window.initAccountPage?.();
    if (location.hash.startsWith('#mail')) {
      document.getElementById('mail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },
});

document.getElementById('pw-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const note = document.getElementById('pw-note');
  try {
    await adminFetch('/api/admin/account/password', {
      method: 'POST',
      body: JSON.stringify({
        current_password: document.getElementById('current_password').value,
        new_password: document.getElementById('new_password').value,
      }),
    });
    note.textContent = 'Password updated.';
    note.className = 'admin-note success';
    note.style.display = 'block';
    document.getElementById('pw-form').reset();
  } catch (err) {
    note.textContent = err.message;
    note.className = 'admin-note error';
    note.style.display = 'block';
  }
});
</script>
</body>
</html>
