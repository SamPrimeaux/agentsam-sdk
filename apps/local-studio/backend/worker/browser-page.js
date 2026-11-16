/**
 * In-app Browser page route: GET /api/browser/page?url=<https url>
 *
 * Web pages cannot be framed directly when the target sends X-Frame-Options or a CSP
 * frame-ancestors rule. This route fetches the page for the signed-in account and serves it
 * back inside a sandboxed document so Browser can show it in the Side Stage.
 *
 * Boundaries (kept narrow on purpose):
 *  - Requires a Studio session; the caller passes the resolved account id.
 *  - http(s) only, no credentials in the URL, no private / loopback / link-local hosts,
 *    every redirect hop re-validated, never this app's own origin.
 *  - No cookies or Authorization are forwarded to the target and none are returned.
 *  - The response is sandboxed by CSP (opaque origin): the page can run its own scripts but can
 *    never reach this app's cookies, storage, or DOM.
 *  - GET navigation only; links and GET forms are routed back to the Browser tab by script.
 */
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15000;
const USER_AGENT = "Mozilla/5.0 (compatible; AgentSamBrowser/1.0; +https://agentsam.inneranimalmedia.com)";
const SANDBOX_CSP = "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'";
const PASSTHROUGH = /^(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|application\/pdf|text\/plain)(;|$)/i;

const PRIVATE_V4 = [
  [0, 0, 0, 0, 8], [10, 0, 0, 0, 8], [100, 64, 0, 0, 10], [127, 0, 0, 0, 8], [169, 254, 0, 0, 16],
  [172, 16, 0, 0, 12], [192, 0, 0, 0, 24], [192, 168, 0, 0, 16], [198, 18, 0, 0, 15], [224, 0, 0, 0, 3],
];

function ipv4ToInt(parts) { return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0; }

function isPrivateV4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const value = ipv4ToInt(parts);
  return PRIVATE_V4.some((range) => {
    const base = ipv4ToInt(range.slice(0, 4));
    const mask = range[4] === 0 ? 0 : (0xffffffff << (32 - range[4])) >>> 0;
    return (value & mask) === (base & mask);
  });
}

/** True when the host is not a public internet name or address. */
export function isBlockedBrowserHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")
    || host.endsWith(".lan") || host.endsWith(".home.arpa")) return true;
  if (host.includes(":")) {
    // IPv6 literals are not browsable; this also covers loopback, ULA, link-local and mapped v4.
    return true;
  }
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true; // integer / hex IPv4 tricks
  if (isPrivateV4(host)) return true;
  if (!host.includes(".") && !/^\d/.test(host)) return true; // bare intranet names
  return false;
}

/** Validate and normalize a target. Throws a short code on rejection. */
export function normalizeBrowserTarget(input, ownHost = "") {
  let raw = String(input ?? "").trim();
  if (!raw || raw.length > 2048) throw new Error("browser_url_invalid");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) raw = `https://${raw}`;
  let parsed;
  try { parsed = new URL(raw); } catch { throw new Error("browser_url_invalid"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password)
    throw new Error("browser_url_invalid");
  if (parsed.port && !["80", "443"].includes(parsed.port)) throw new Error("browser_url_blocked");
  if (isBlockedBrowserHost(parsed.hostname)) throw new Error("browser_url_blocked");
  if (ownHost && parsed.hostname.toLowerCase() === ownHost.toLowerCase()) throw new Error("browser_url_blocked");
  parsed.hash = "";
  return parsed;
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

function noticePage(status, title, detail, target) {
  const retry = target ? `<p><a href="${escapeHtml(target)}">Try again</a></p>` : "";
  const body = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html{color-scheme:light dark}body{font:14px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center}
main{max-width:420px}h1{font-size:16px;margin:0 0 6px}p{margin:6px 0;opacity:.75}a{color:inherit}</style>
<main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p>${retry}</main>
<script>addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[href]");if(!a)return;e.preventDefault();parent.postMessage({source:"agentsam-browser",type:"navigate",url:a.href},"*")},true)</script>`;
  return new Response(body, { status, headers: {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
    "content-security-policy": SANDBOX_CSP, "x-content-type-options": "nosniff",
  } });
}

/** Script injected into proxied pages: keeps navigation inside the Browser tab. */
const BRIDGE = `<script>(function(){
function send(m){try{parent.postMessage(Object.assign({source:"agentsam-browser"},m),"*")}catch(e){}}
function go(u){send({type:"navigate",url:u})}
addEventListener("click",function(e){
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(!a)return;
  var href=a.href;if(!/^https?:/i.test(href))return;
  var here=document.baseURI.split("#")[0];
  if(href.split("#")[0]===here&&href.indexOf("#")>-1)return;
  e.preventDefault();go(href);
},true);
addEventListener("submit",function(e){
  var f=e.target;if(!f||!f.action)return;
  e.preventDefault();
  if(String(f.method||"get").toLowerCase()!=="get")return;
  try{var u=new URL(f.action,document.baseURI);var d=new FormData(f);
    d.forEach(function(v,k){if(typeof v==="string")u.searchParams.set(k,v)});go(u.href)}catch(x){}
},true);
window.open=function(u){if(u){try{go(new URL(u,document.baseURI).href)}catch(x){}}return null};
function title(){send({type:"title",url:document.baseURI,title:document.title||""})}
addEventListener("load",title);
new MutationObserver(title).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
})();</script>`;

export function rewriteHtml(html, finalUrl) {
  let out = html.replace(/<meta[^>]+http-equiv\s*=\s*["']?(content-security-policy|x-frame-options|refresh)["']?[^>]*>/gi, "");
  const injected = `<base href="${escapeHtml(finalUrl)}">${BRIDGE}`;
  if (/<head[^>]*>/i.test(out)) return out.replace(/<head([^>]*)>/i, (m) => m + injected);
  if (/<html[^>]*>/i.test(out)) return out.replace(/<html([^>]*)>/i, (m) => m + "<head>" + injected + "</head>");
  return `<!doctype html><head>${injected}</head>` + out;
}

async function readCapped(response, limit) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) { await reader.cancel().catch(() => undefined); throw new Error("browser_page_too_large"); }
    chunks.push(value);
  }
  const merged = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.byteLength; }
  return merged;
}

export async function handleBrowserPage(request, userId, { fetchImpl = fetch } = {}) {
  if (request.method !== "GET" && request.method !== "HEAD")
    return noticePage(405, "Page unavailable", "Only page views are supported here.");
  if (!userId) return noticePage(401, "Sign in to browse", "Your session has ended. Sign in again to keep browsing.");
  const requestUrl = new URL(request.url);
  let target;
  try { target = normalizeBrowserTarget(requestUrl.searchParams.get("url"), requestUrl.hostname); }
  catch (error) {
    return error.message === "browser_url_blocked"
      ? noticePage(403, "This address can't be opened here", "Pages on private or internal networks aren't available in the browser.")
      : noticePage(400, "That address doesn't look right", "Check the address and try again.");
  }
  let current = target;
  let response;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetchImpl(current.href, {
        method: "GET", redirect: "manual", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml,image/*,*/*;q=0.8", "accept-language": request.headers.get("accept-language") || "en" },
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
        if (hop === MAX_REDIRECTS) return noticePage(508, "Too many redirects", "This page keeps redirecting.", target.href);
        current = normalizeBrowserTarget(new URL(response.headers.get("location"), current).href, requestUrl.hostname);
        continue;
      }
      break;
    }
  } catch (error) {
    if (error?.message === "browser_url_blocked" || error?.message === "browser_url_invalid")
      return noticePage(403, "This address can't be opened here", "The page redirected somewhere that isn't available in the browser.");
    return noticePage(502, "Couldn't reach this page", "The site didn't respond. Check the address or try again.", target.href);
  }
  const type = response.headers.get("content-type") || "";
  const headers = { "cache-control": "private, no-store", "content-security-policy": SANDBOX_CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
  if (PASSTHROUGH.test(type)) {
    return new Response(request.method === "HEAD" ? null : response.body, { status: response.status, headers: { ...headers, "content-type": type } });
  }
  if (!/^(text\/html|application\/xhtml\+xml)/i.test(type))
    return noticePage(415, "This file can't be previewed", "Pages, images, PDFs and text open in the browser.");
  try {
    const bytes = await readCapped(response, MAX_HTML_BYTES);
    const charset = /charset=([\w-]+)/i.exec(type)?.[1] || "utf-8";
    let text; try { text = new TextDecoder(charset).decode(bytes); } catch { text = new TextDecoder().decode(bytes); }
    return new Response(request.method === "HEAD" ? null : rewriteHtml(text, current.href), {
      status: response.status, headers: { ...headers, "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return error?.message === "browser_page_too_large"
      ? noticePage(413, "This page is too large to show", "Try a lighter page.")
      : noticePage(502, "Couldn't load this page", "Something interrupted the page.", target.href);
  }
}
