function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeReturnTo(value) {
  const target = String(value || "/").trim();
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\") || target.startsWith("/api/") || target.startsWith("/admin")) return "/";
  return target.slice(0, 2048);
}

function safeAccent(value) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : "#789b7c";
}

function safeLogoUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("/media/") || /^https:\/\//i.test(url) ? url : "";
}

/**
 * Render the shared-password entry portal used by storefronts.
 * This is distinct from customer account sign-in: one merchant-managed password
 * protects the whole site; customer identities use the Identity account portal.
 */
export function renderStorePasswordPortal({
  siteName = "This store",
  logoUrl = "",
  accent = "#789b7c",
  returnTo = "/",
  error = "",
} = {}) {
  const rawName = String(siteName || "This store").slice(0, 120);
  const name = escapeHtml(rawName);
  const destination = escapeHtml(safeReturnTo(returnTo));
  const brandAccent = safeAccent(accent);
  const logo = safeLogoUrl(logoUrl);
  const errorMarkup = error
    ? "<p class=\"error\" role=\"alert\">" + escapeHtml(error) + "</p>"
    : "";
  const brandMarkup = logo
    ? "<img class=\"brand-image\" src=\"" + escapeHtml(logo) + "\" alt=\"" + name + "\">"
    : "<span class=\"brand-mark\" aria-hidden=\"true\">" + escapeHtml(rawName.trim().slice(0, 1).toUpperCase() || "S") + "</span>";

  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "  <meta charset=\"utf-8\">",
    "  <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "  <meta name=\"robots\" content=\"noindex,nofollow\">",
    "  <meta name=\"referrer\" content=\"same-origin\">",
    "  <title>Enter password · " + name + "</title>",
    "  <style>",
    "    :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f4f5f2;color:#20251f;--portal-accent:" + brandAccent + "}",
    "    *{box-sizing:border-box}",
    "    body{margin:0;min-height:100svh;display:grid;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--portal-accent) 18%,transparent),transparent 54%),#f4f5f2}",
    "    main{width:min(100%,420px);padding:clamp(28px,6vw,42px);border:1px solid #e2e7df;border-radius:22px;background:rgba(255,255,255,.94);box-shadow:0 24px 80px rgba(24,35,25,.09)}",
    "    .brand{display:flex;justify-content:center;margin:0 auto 24px}.brand-image{display:block;max-width:160px;max-height:76px;object-fit:contain}.brand-mark{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:var(--portal-accent);color:#fff;font-size:21px;font-weight:700}",
    "    .eyebrow{text-align:center;margin:0 0 8px;color:#687468;font-size:12px;font-weight:650;letter-spacing:.1em;text-transform:uppercase}",
    "    h1{margin:0;text-align:center;font-size:clamp(24px,5vw,30px);line-height:1.12;letter-spacing:-.04em;font-weight:680;color:#20251f}",
    "    .intro{margin:12px 0 26px;text-align:center;color:#657064;font-size:14px;line-height:1.6}",
    "    label{display:block;margin:0 0 8px;color:#343d33;font-size:13px;font-weight:620}",
    "    input{width:100%;min-height:48px;padding:0 14px;border:1px solid #d9dfd6;border-radius:11px;background:#fff;color:#20251f;font:inherit;font-size:15px;outline:none}",
    "    input:focus{border-color:var(--portal-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--portal-accent) 18%,transparent)}",
    "    button{width:100%;min-height:48px;margin-top:16px;border:0;border-radius:11px;background:var(--portal-accent);color:#fff;font:inherit;font-size:14px;font-weight:680;cursor:pointer}",
    "    button:hover{filter:brightness(.96)}button:focus-visible{outline:3px solid color-mix(in srgb,var(--portal-accent) 32%,white);outline-offset:2px}",
    "    .error{margin:0 0 16px;padding:11px 12px;border:1px solid #f1c7c3;border-radius:10px;background:#fff3f1;color:#a12b20;font-size:13px;line-height:1.45}",
    "    .foot{margin:20px 0 0;text-align:center;color:#788176;font-size:12px;line-height:1.5}",
    "    @media(prefers-color-scheme:dark){:root{color-scheme:dark;background:#111711;color:#eef3ed}body{background:radial-gradient(ellipse at 50% 0%,color-mix(in srgb,var(--portal-accent) 26%,transparent),transparent 54%),#111711}main{border-color:#303b30;background:rgba(25,33,25,.96);box-shadow:0 24px 80px rgba(0,0,0,.28)}h1{color:#eef3ed}.eyebrow,label,.intro,.foot{color:#aab7a8}input{border-color:#465346;background:#171f17;color:#eef3ed}.error{border-color:#6b3732;background:#321f1d;color:#ffb6ac}}",
    "    @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;transition:none!important}}",
    "  </style>",
    "</head>",
    "<body>",
    "  <main>",
    "    <div class=\"brand\">" + brandMarkup + "</div>",
    "    <p class=\"eyebrow\">Private storefront</p>",
    "    <h1>" + name + "</h1>",
    "    <p class=\"intro\">This website is password protected. Enter the password provided by the store owner to continue.</p>",
    "    " + errorMarkup,
    "    <form method=\"post\" action=\"/api/storefront/access\">",
    "      <input type=\"hidden\" name=\"return_to\" value=\"" + destination + "\">",
    "      <label for=\"store-password\">Store password</label>",
    "      <input id=\"store-password\" name=\"password\" type=\"password\" autocomplete=\"current-password\" required autofocus>",
    "      <button type=\"submit\">Continue to store</button>",
    "    </form>",
    "    <p class=\"foot\">Access is remembered on this device for 7 days.</p>",
    "  </main>",
    "</body>",
    "</html>",
  ].join("\n");
}
