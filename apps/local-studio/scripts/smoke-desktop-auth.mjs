import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const appRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(appRoot, "..", "..");
const desktopDist = join(appRoot, "desktop-dist");

function read(path) {
  return readFileSync(path, "utf8");
}

function walkJs(root) {
  const out = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walkJs(path));
    else if (path.endsWith(".js")) out.push(path);
  }
  return out;
}

const source = {
  portal: read(join(appRoot, "frontend/src/components/desktop/DesktopIdentityPortal.tsx")),
  auth: read(join(appRoot, "frontend/src/lib/desktop/native-auth.ts")),
  tauri: read(join(appRoot, "frontend/src/lib/desktop/tauri.ts")),
  rust: read(join(repoRoot, "packages/agentsam-desktop-shell/src-tauri/src/commands/local_identity.rs")),
  googleDesktopRust: read(join(repoRoot, "packages/agentsam-desktop-shell/src-tauri/src/commands/google_desktop_identity.rs")),
  googleDesktopWorker: read(join(repoRoot, "packages/identity/src/oauth/google-desktop-exchange.js")),
  deepLink: read(join(repoRoot, "packages/agentsam-desktop-shell/src-tauri/src/commands/deep_link.rs")),
  config: read(join(repoRoot, "packages/agentsam-desktop-shell/src-tauri/tauri.conf.json")),
};

const failures = [];
function requireSource(condition, reason) {
  if (!condition) failures.push(reason);
}

requireSource(!source.portal.includes("<iframe"), "desktop_identity_iframe_present");
requireSource(!source.portal.includes("/auth/login.html?desktop=1"), "legacy_desktop_login_path_present");
requireSource(source.auth.includes("agentsamstudio://auth/callback"), "native_callback_scheme_missing");
requireSource(source.auth.includes('op: "native_exchange"'), "native_exchange_client_missing");
requireSource(source.auth.includes("identity_native_oauth_pending"), "pkce_pending_secure_store_missing");
requireSource(source.auth.includes("openExternalUrl"), "system_browser_open_missing");
requireSource(source.auth.includes("listenDeepLinks"), "frontend_deep_link_listener_missing");
requireSource(source.tauri.includes('invoke("take_pending_deep_links"'), "native_deep_link_drain_missing");
requireSource(source.deepLink.includes("DeepLinkState"), "native_deep_link_state_missing");
requireSource(source.deepLink.includes("take_pending_deep_links"), "native_deep_link_command_missing");
requireSource(source.auth.includes('provider === "google"'), "google_desktop_branch_missing");
requireSource(source.auth.includes("google_desktop_identity_login"), "google_desktop_command_missing");
requireSource(source.auth.includes("google_desktop_native_flow_required"), "google_web_native_fail_closed_missing");
requireSource(source.googleDesktopRust.includes("google_desktop_client_id"), "google_desktop_public_config_missing");
requireSource(source.googleDesktopRust.includes("openid email profile"), "google_desktop_identity_scopes_missing");
requireSource(source.googleDesktopRust.includes("/api/oauth/google/desktop-login-exchange"), "google_desktop_identity_exchange_missing");
requireSource(source.googleDesktopWorker.includes("GOOGLE_DESKTOP_CLIENT_ID"), "google_desktop_worker_client_gate_missing");
requireSource(source.googleDesktopWorker.includes("sessionType: SESSION_TYPES.DESKTOP"), "google_desktop_session_type_missing");
requireSource(source.rust.includes('"/api/oauth/native/exchange"'), "native_exchange_rust_route_missing");
requireSource(source.deepLink.includes('"agentsam://deep-link"'), "rust_deep_link_emit_missing");
requireSource(source.config.includes('"agentsamstudio"'), "deep_link_registration_missing");

if (!existsSync(desktopDist)) {
  failures.push("desktop_dist_missing");
} else {
  const jsFiles = walkJs(desktopDist);
  const bundle = jsFiles.map(read).join("\n");
  requireSource(bundle.includes("agentsamstudio://auth/callback"), "built_native_callback_missing");
  requireSource(bundle.includes("native_exchange"), "built_native_exchange_missing");
  requireSource(bundle.includes("identity_native_oauth_pending"), "built_pkce_pending_missing");
  requireSource(bundle.includes("google_desktop_identity_login"), "built_google_desktop_command_missing");
  requireSource(bundle.includes("google_desktop_native_flow_required"), "built_google_web_native_fail_closed_missing");
  requireSource(!bundle.includes("/auth/login.html?desktop=1"), "built_legacy_desktop_iframe_path_present");
}

if (failures.length) {
  console.error("[desktop-auth-smoke] FAIL", failures.join(", "));
  process.exit(4);
}

console.log("[desktop-auth-smoke] PASS");
console.log("[desktop-auth-smoke] Google Desktop PKCE + native handoff providers + secure AgentSam session contract present");
