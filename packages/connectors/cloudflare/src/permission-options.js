/**
 * Offerable Cloudflare permission options — every Local Studio scope, grouped for UX/OAuth.
 * Users pick categories / products / packs. Default mint stays least-privilege;
 * pack `all` or `{ all: true }` explicitly requests the full catalog.
 */
import { CLOUDFLARE_ALL_SCOPES } from './scope-catalog.js';

export const CLOUDFLARE_PERMISSION_CATEGORY_LABELS = Object.freeze({
  "developer_platform": "Developer Platform",
  "ai": "AI & Machine Learning",
  "dns_zones": "DNS & Zones",
  "app_security": "App Security",
  "rules": "Rules & Configuration",
  "zero_trust": "Cloudflare One / Zero Trust",
  "analytics": "Analytics & Logs",
  "network": "Network Services",
  "media": "Media",
  "email": "Email & Messaging",
  "cache": "Cache & Performance",
  "account": "Account & Billing",
  "other": "Other"
});

/** @type {Record<string, { id: string, category: string, label: string, oauthScopes: string[] }>} */
export const CLOUDFLARE_PERMISSION_PRODUCTS = Object.freeze({
  "access": Object.freeze({
    id: "cloudflare.perm.access",
    category: "zero_trust",
    label: "Access",
    oauthScopes: Object.freeze(["access.read","access.revoke","access.write"]),
  }),
  "access-acct": Object.freeze({
    id: "cloudflare.perm.access-acct",
    category: "zero_trust",
    label: "Access Acct",
    oauthScopes: Object.freeze(["access-acct.read","access-acct.revoke","access-acct.write"]),
  }),
  "access-app": Object.freeze({
    id: "cloudflare.perm.access-app",
    category: "zero_trust",
    label: "Access App",
    oauthScopes: Object.freeze(["access-app.read","access-app.revoke","access-app.write"]),
  }),
  "access-audit-log": Object.freeze({
    id: "cloudflare.perm.access-audit-log",
    category: "zero_trust",
    label: "Access Audit Log",
    oauthScopes: Object.freeze(["access-audit-log.read"]),
  }),
  "access-certificate": Object.freeze({
    id: "cloudflare.perm.access-certificate",
    category: "zero_trust",
    label: "Access Certificate",
    oauthScopes: Object.freeze(["access-certificate.read","access-certificate.write"]),
  }),
  "access-custom-page": Object.freeze({
    id: "cloudflare.perm.access-custom-page",
    category: "zero_trust",
    label: "Access Custom Page",
    oauthScopes: Object.freeze(["access-custom-page.read","access-custom-page.write"]),
  }),
  "access-device-posture": Object.freeze({
    id: "cloudflare.perm.access-device-posture",
    category: "zero_trust",
    label: "Access Device Posture",
    oauthScopes: Object.freeze(["access-device-posture.read","access-device-posture.write"]),
  }),
  "access-group": Object.freeze({
    id: "cloudflare.perm.access-group",
    category: "zero_trust",
    label: "Access Group",
    oauthScopes: Object.freeze(["access-group.read","access-group.write"]),
  }),
  "access-idp": Object.freeze({
    id: "cloudflare.perm.access-idp",
    category: "zero_trust",
    label: "Access Idp",
    oauthScopes: Object.freeze(["access-idp.read","access-idp.write"]),
  }),
  "access-key": Object.freeze({
    id: "cloudflare.perm.access-key",
    category: "zero_trust",
    label: "Access Key",
    oauthScopes: Object.freeze(["access-key.read","access-key.write"]),
  }),
  "access-org": Object.freeze({
    id: "cloudflare.perm.access-org",
    category: "zero_trust",
    label: "Access Org",
    oauthScopes: Object.freeze(["access-org.read","access-org.revoke","access-org.write"]),
  }),
  "access-policy": Object.freeze({
    id: "cloudflare.perm.access-policy",
    category: "zero_trust",
    label: "Access Policy",
    oauthScopes: Object.freeze(["access-policy.read","access-policy.write"]),
  }),
  "access-policy-test": Object.freeze({
    id: "cloudflare.perm.access-policy-test",
    category: "zero_trust",
    label: "Access Policy Test",
    oauthScopes: Object.freeze(["access-policy-test.read","access-policy-test.write"]),
  }),
  "access-population": Object.freeze({
    id: "cloudflare.perm.access-population",
    category: "zero_trust",
    label: "Access Population",
    oauthScopes: Object.freeze(["access-population.read","access-population.write"]),
  }),
  "access-saml-certificate": Object.freeze({
    id: "cloudflare.perm.access-saml-certificate",
    category: "zero_trust",
    label: "Access Saml Certificate",
    oauthScopes: Object.freeze(["access-saml-certificate.read","access-saml-certificate.write"]),
  }),
  "access-scim-log": Object.freeze({
    id: "cloudflare.perm.access-scim-log",
    category: "zero_trust",
    label: "Access Scim Log",
    oauthScopes: Object.freeze(["access-scim-log.read"]),
  }),
  "access-seats": Object.freeze({
    id: "cloudflare.perm.access-seats",
    category: "zero_trust",
    label: "Access Seats",
    oauthScopes: Object.freeze(["access-seats.write"]),
  }),
  "access-service-token": Object.freeze({
    id: "cloudflare.perm.access-service-token",
    category: "zero_trust",
    label: "Access Service Token",
    oauthScopes: Object.freeze(["access-service-token.read","access-service-token.write"]),
  }),
  "access-ssh-auditing": Object.freeze({
    id: "cloudflare.perm.access-ssh-auditing",
    category: "zero_trust",
    label: "Access Ssh Auditing",
    oauthScopes: Object.freeze(["access-ssh-auditing.read","access-ssh-auditing.write"]),
  }),
  "access-tag": Object.freeze({
    id: "cloudflare.perm.access-tag",
    category: "zero_trust",
    label: "Access Tag",
    oauthScopes: Object.freeze(["access-tag.read","access-tag.write"]),
  }),
  "access-users": Object.freeze({
    id: "cloudflare.perm.access-users",
    category: "zero_trust",
    label: "Access Users",
    oauthScopes: Object.freeze(["access-users.read","access-users.write"]),
  }),
  "account-analytics": Object.freeze({
    id: "cloudflare.perm.account-analytics",
    category: "analytics",
    label: "Account Analytics",
    oauthScopes: Object.freeze(["account-analytics.read"]),
  }),
  "account-api-gateway": Object.freeze({
    id: "cloudflare.perm.account-api-gateway",
    category: "account",
    label: "Account Api Gateway",
    oauthScopes: Object.freeze(["account-api-gateway.write","account-api-gateway.read"]),
  }),
  "account-custom-asset": Object.freeze({
    id: "cloudflare.perm.account-custom-asset",
    category: "account",
    label: "Account Custom Asset",
    oauthScopes: Object.freeze(["account-custom-asset.read","account-custom-asset.write"]),
  }),
  "account-custom-error-rules": Object.freeze({
    id: "cloudflare.perm.account-custom-error-rules",
    category: "rules",
    label: "Account Custom Error Rules",
    oauthScopes: Object.freeze(["account-custom-error-rules.read","account-custom-error-rules.write"]),
  }),
  "account-custom-pages": Object.freeze({
    id: "cloudflare.perm.account-custom-pages",
    category: "rules",
    label: "Account Custom Pages",
    oauthScopes: Object.freeze(["account-custom-pages.read","account-custom-pages.write"]),
  }),
  "account-dns-settings": Object.freeze({
    id: "cloudflare.perm.account-dns-settings",
    category: "dns_zones",
    label: "Account Dns Settings",
    oauthScopes: Object.freeze(["account-dns-settings.read","account-dns-settings.write"]),
  }),
  "account-firewall-access-rules": Object.freeze({
    id: "cloudflare.perm.account-firewall-access-rules",
    category: "app_security",
    label: "Account Firewall Access Rules",
    oauthScopes: Object.freeze(["account-firewall-access-rules.read","account-firewall-access-rules.write"]),
  }),
  "account-logs": Object.freeze({
    id: "cloudflare.perm.account-logs",
    category: "analytics",
    label: "Account Logs",
    oauthScopes: Object.freeze(["account-logs.read","account-logs.write"]),
  }),
  "account-rule-lists": Object.freeze({
    id: "cloudflare.perm.account-rule-lists",
    category: "rules",
    label: "Account Rule Lists",
    oauthScopes: Object.freeze(["account-rule-lists.read","account-rule-lists.write"]),
  }),
  "account-rulesets": Object.freeze({
    id: "cloudflare.perm.account-rulesets",
    category: "rules",
    label: "Account Rulesets",
    oauthScopes: Object.freeze(["account-rulesets.read","account-rulesets.write"]),
  }),
  "account-security-center-insights": Object.freeze({
    id: "cloudflare.perm.account-security-center-insights",
    category: "app_security",
    label: "Account Security Center Insights",
    oauthScopes: Object.freeze(["account-security-center-insights.read","account-security-center-insights.write"]),
  }),
  "account-settings": Object.freeze({
    id: "cloudflare.perm.account-settings",
    category: "account",
    label: "Account Settings",
    oauthScopes: Object.freeze(["account-settings.read","account-settings.write"]),
  }),
  "account-ssl-and-certificates": Object.freeze({
    id: "cloudflare.perm.account-ssl-and-certificates",
    category: "cache",
    label: "Account Ssl And Certificates",
    oauthScopes: Object.freeze(["account-ssl-and-certificates.read","account-ssl-and-certificates.write"]),
  }),
  "account-waf": Object.freeze({
    id: "cloudflare.perm.account-waf",
    category: "app_security",
    label: "Account Waf",
    oauthScopes: Object.freeze(["account-waf.read","account-waf.write"]),
  }),
  "account-waiting-rooms": Object.freeze({
    id: "cloudflare.perm.account-waiting-rooms",
    category: "network",
    label: "Account Waiting Rooms",
    oauthScopes: Object.freeze(["account-waiting-rooms.read"]),
  }),
  "agent-memory": Object.freeze({
    id: "cloudflare.perm.agent-memory",
    category: "developer_platform",
    label: "Agent Memory",
    oauthScopes: Object.freeze(["agent-memory.write"]),
  }),
  "agw": Object.freeze({
    id: "cloudflare.perm.agw",
    category: "ai",
    label: "Agw",
    oauthScopes: Object.freeze(["agw.read","agw.run","agw.write"]),
  }),
  "ai": Object.freeze({
    id: "cloudflare.perm.ai",
    category: "ai",
    label: "Ai",
    oauthScopes: Object.freeze(["ai.read","ai.write"]),
  }),
  "ai-model": Object.freeze({
    id: "cloudflare.perm.ai-model",
    category: "ai",
    label: "Ai Model",
    oauthScopes: Object.freeze(["ai-model.read","ai-model.write"]),
  }),
  "ai-search": Object.freeze({
    id: "cloudflare.perm.ai-search",
    category: "ai",
    label: "Ai Search",
    oauthScopes: Object.freeze(["ai-search.index","ai-search.read","ai-search.run","ai-search.write"]),
  }),
  "aiaudit": Object.freeze({
    id: "cloudflare.perm.aiaudit",
    category: "ai",
    label: "Aiaudit",
    oauthScopes: Object.freeze(["aiaudit.read","aiaudit.write"]),
  }),
  "aig": Object.freeze({
    id: "cloudflare.perm.aig",
    category: "ai",
    label: "Aig",
    oauthScopes: Object.freeze(["aig.read","aig.run","aig.write"]),
  }),
  "analytics": Object.freeze({
    id: "cloudflare.perm.analytics",
    category: "analytics",
    label: "Analytics",
    oauthScopes: Object.freeze(["analytics.read"]),
  }),
  "apps": Object.freeze({
    id: "cloudflare.perm.apps",
    category: "account",
    label: "Apps",
    oauthScopes: Object.freeze(["apps.write"]),
  }),
  "argotunnel": Object.freeze({
    id: "cloudflare.perm.argotunnel",
    category: "zero_trust",
    label: "Argotunnel",
    oauthScopes: Object.freeze(["argotunnel.read","argotunnel.write"]),
  }),
  "artifacts": Object.freeze({
    id: "cloudflare.perm.artifacts",
    category: "other",
    label: "Artifacts",
    oauthScopes: Object.freeze(["artifacts.read","artifacts.write"]),
  }),
  "bot-management": Object.freeze({
    id: "cloudflare.perm.bot-management",
    category: "app_security",
    label: "Bot Management",
    oauthScopes: Object.freeze(["bot-management.read","bot-management.write"]),
  }),
  "bot-management-feedback": Object.freeze({
    id: "cloudflare.perm.bot-management-feedback",
    category: "app_security",
    label: "Bot Management Feedback",
    oauthScopes: Object.freeze(["bot-management-feedback.read","bot-management-feedback.write"]),
  }),
  "browser-rendering": Object.freeze({
    id: "cloudflare.perm.browser-rendering",
    category: "developer_platform",
    label: "Browser Rendering",
    oauthScopes: Object.freeze(["browser-rendering.read","browser-rendering.write"]),
  }),
  "cache": Object.freeze({
    id: "cloudflare.perm.cache",
    category: "cache",
    label: "Cache",
    oauthScopes: Object.freeze(["cache.purge"]),
  }),
  "cache-settings": Object.freeze({
    id: "cloudflare.perm.cache-settings",
    category: "cache",
    label: "Cache Settings",
    oauthScopes: Object.freeze(["cache-settings.read","cache-settings.write"]),
  }),
  "calls": Object.freeze({
    id: "cloudflare.perm.calls",
    category: "media",
    label: "Calls",
    oauthScopes: Object.freeze(["calls.read","calls.write"]),
  }),
  "casb": Object.freeze({
    id: "cloudflare.perm.casb",
    category: "zero_trust",
    label: "Casb",
    oauthScopes: Object.freeze(["casb.read","casb.write"]),
  }),
  "cf-agents": Object.freeze({
    id: "cloudflare.perm.cf-agents",
    category: "developer_platform",
    label: "Cf Agents",
    oauthScopes: Object.freeze(["cf-agents.read","cf-agents.write"]),
  }),
  "cfspeed": Object.freeze({
    id: "cloudflare.perm.cfspeed",
    category: "developer_platform",
    label: "Cfspeed",
    oauthScopes: Object.freeze(["cfspeed.read","cfspeed.write"]),
  }),
  "cloud-connector": Object.freeze({
    id: "cloudflare.perm.cloud-connector",
    category: "developer_platform",
    label: "Cloud Connector",
    oauthScopes: Object.freeze(["cloud-connector.read","cloud-connector.write"]),
  }),
  "cloud-email-security": Object.freeze({
    id: "cloudflare.perm.cloud-email-security",
    category: "email",
    label: "Cloud Email Security",
    oauthScopes: Object.freeze(["cloud-email-security.read","cloud-email-security.write"]),
  }),
  "cloudchamber": Object.freeze({
    id: "cloudflare.perm.cloudchamber",
    category: "developer_platform",
    label: "Cloudchamber",
    oauthScopes: Object.freeze(["cloudchamber.read","cloudchamber.write"]),
  }),
  "config-settings": Object.freeze({
    id: "cloudflare.perm.config-settings",
    category: "rules",
    label: "Config Settings",
    oauthScopes: Object.freeze(["config-settings.read","config-settings.write"]),
  }),
  "connectivity-directory": Object.freeze({
    id: "cloudflare.perm.connectivity-directory",
    category: "network",
    label: "Connectivity Directory",
    oauthScopes: Object.freeze(["connectivity-directory.admin","connectivity-directory.bind","connectivity-directory.read"]),
  }),
  "constellation": Object.freeze({
    id: "cloudflare.perm.constellation",
    category: "developer_platform",
    label: "Constellation",
    oauthScopes: Object.freeze(["constellation.read","constellation.write"]),
  }),
  "containers": Object.freeze({
    id: "cloudflare.perm.containers",
    category: "developer_platform",
    label: "Containers",
    oauthScopes: Object.freeze(["containers.read","containers.write"]),
  }),
  "custom-errors": Object.freeze({
    id: "cloudflare.perm.custom-errors",
    category: "rules",
    label: "Custom Errors",
    oauthScopes: Object.freeze(["custom-errors.read","custom-errors.write"]),
  }),
  "custom-pages": Object.freeze({
    id: "cloudflare.perm.custom-pages",
    category: "rules",
    label: "Custom Pages",
    oauthScopes: Object.freeze(["custom-pages.read","custom-pages.write"]),
  }),
  "d1": Object.freeze({
    id: "cloudflare.perm.d1",
    category: "developer_platform",
    label: "D1",
    oauthScopes: Object.freeze(["d1.read","d1.write"]),
  }),
  "dls": Object.freeze({
    id: "cloudflare.perm.dls",
    category: "zero_trust",
    label: "Dls",
    oauthScopes: Object.freeze(["dls.read","dls.write"]),
  }),
  "dns": Object.freeze({
    id: "cloudflare.perm.dns",
    category: "dns_zones",
    label: "Dns",
    oauthScopes: Object.freeze(["dns.read","dns.write"]),
  }),
  "dns-firewall": Object.freeze({
    id: "cloudflare.perm.dns-firewall",
    category: "dns_zones",
    label: "Dns Firewall",
    oauthScopes: Object.freeze(["dns-firewall.read","dns-firewall.write"]),
  }),
  "dns-view": Object.freeze({
    id: "cloudflare.perm.dns-view",
    category: "dns_zones",
    label: "Dns View",
    oauthScopes: Object.freeze(["dns-view.read","dns-view.write"]),
  }),
  "dynamic-redirect": Object.freeze({
    id: "cloudflare.perm.dynamic-redirect",
    category: "rules",
    label: "Dynamic Redirect",
    oauthScopes: Object.freeze(["dynamic-redirect.read","dynamic-redirect.write"]),
  }),
  "email-routing-account-rule": Object.freeze({
    id: "cloudflare.perm.email-routing-account-rule",
    category: "email",
    label: "Email Routing Account Rule",
    oauthScopes: Object.freeze(["email-routing-account-rule.read"]),
  }),
  "email-routing-address": Object.freeze({
    id: "cloudflare.perm.email-routing-address",
    category: "email",
    label: "Email Routing Address",
    oauthScopes: Object.freeze(["email-routing-address.read","email-routing-address.write"]),
  }),
  "email-routing-rule": Object.freeze({
    id: "cloudflare.perm.email-routing-rule",
    category: "email",
    label: "Email Routing Rule",
    oauthScopes: Object.freeze(["email-routing-rule.read","email-routing-rule.write"]),
  }),
  "email-routing-suppression": Object.freeze({
    id: "cloudflare.perm.email-routing-suppression",
    category: "email",
    label: "Email Routing Suppression",
    oauthScopes: Object.freeze(["email-routing-suppression.read","email-routing-suppression.write"]),
  }),
  "email-security-dmarcreports": Object.freeze({
    id: "cloudflare.perm.email-security-dmarcreports",
    category: "email",
    label: "Email Security Dmarcreports",
    oauthScopes: Object.freeze(["email-security-dmarcreports.write"]),
  }),
  "email-sending": Object.freeze({
    id: "cloudflare.perm.email-sending",
    category: "email",
    label: "Email Sending",
    oauthScopes: Object.freeze(["email-sending.read","email-sending.write"]),
  }),
  "firewall-for-ai": Object.freeze({
    id: "cloudflare.perm.firewall-for-ai",
    category: "ai",
    label: "Firewall For Ai",
    oauthScopes: Object.freeze(["firewall-for-ai.read","firewall-for-ai.write"]),
  }),
  "flagship": Object.freeze({
    id: "cloudflare.perm.flagship",
    category: "developer_platform",
    label: "Flagship",
    oauthScopes: Object.freeze(["flagship.evaluate","flagship.read","flagship.write"]),
  }),
  "fraud-detection-pii": Object.freeze({
    id: "cloudflare.perm.fraud-detection-pii",
    category: "app_security",
    label: "Fraud Detection Pii",
    oauthScopes: Object.freeze(["fraud-detection-pii.read"]),
  }),
  "http-applications": Object.freeze({
    id: "cloudflare.perm.http-applications",
    category: "app_security",
    label: "Http Applications",
    oauthScopes: Object.freeze(["http-applications.read","http-applications.write"]),
  }),
  "http-ddos-managed-ruleset": Object.freeze({
    id: "cloudflare.perm.http-ddos-managed-ruleset",
    category: "app_security",
    label: "Http Ddos Managed Ruleset",
    oauthScopes: Object.freeze(["http-ddos-managed-ruleset.read","http-ddos-managed-ruleset.write"]),
  }),
  "images": Object.freeze({
    id: "cloudflare.perm.images",
    category: "media",
    label: "Images",
    oauthScopes: Object.freeze(["images.read","images.write"]),
  }),
  "integration": Object.freeze({
    id: "cloudflare.perm.integration",
    category: "account",
    label: "Integration",
    oauthScopes: Object.freeze(["integration.write"]),
  }),
  "intel": Object.freeze({
    id: "cloudflare.perm.intel",
    category: "analytics",
    label: "Intel",
    oauthScopes: Object.freeze(["intel.read","intel.write"]),
  }),
  "ip-prefix": Object.freeze({
    id: "cloudflare.perm.ip-prefix",
    category: "network",
    label: "Ip Prefix",
    oauthScopes: Object.freeze(["ip-prefix.read","ip-prefix.write"]),
  }),
  "ip-prefix-bgp-on-demand": Object.freeze({
    id: "cloudflare.perm.ip-prefix-bgp-on-demand",
    category: "network",
    label: "Ip Prefix Bgp On Demand",
    oauthScopes: Object.freeze(["ip-prefix-bgp-on-demand.write"]),
  }),
  "k2": Object.freeze({
    id: "cloudflare.perm.k2",
    category: "developer_platform",
    label: "K2",
    oauthScopes: Object.freeze(["k2.read","k2.write","k2.consume","k2.produce"]),
  }),
  "load-balancers": Object.freeze({
    id: "cloudflare.perm.load-balancers",
    category: "network",
    label: "Load Balancers",
    oauthScopes: Object.freeze(["load-balancers.read","load-balancers.write"]),
  }),
  "load-balancers-account": Object.freeze({
    id: "cloudflare.perm.load-balancers-account",
    category: "network",
    label: "Load Balancers Account",
    oauthScopes: Object.freeze(["load-balancers-account.read","load-balancers-account.write"]),
  }),
  "load-balancing-monitors-and-pools": Object.freeze({
    id: "cloudflare.perm.load-balancing-monitors-and-pools",
    category: "network",
    label: "Load Balancing Monitors And Pools",
    oauthScopes: Object.freeze(["load-balancing-monitors-and-pools.read","load-balancing-monitors-and-pools.write"]),
  }),
  "logs": Object.freeze({
    id: "cloudflare.perm.logs",
    category: "analytics",
    label: "Logs",
    oauthScopes: Object.freeze(["logs.read","logs.write"]),
  }),
  "magic-firewall": Object.freeze({
    id: "cloudflare.perm.magic-firewall",
    category: "network",
    label: "Magic Firewall",
    oauthScopes: Object.freeze(["magic-firewall.read","magic-firewall.write"]),
  }),
  "magic-transit": Object.freeze({
    id: "cloudflare.perm.magic-transit",
    category: "network",
    label: "Magic Transit",
    oauthScopes: Object.freeze(["magic-transit.read","magic-transit.write"]),
  }),
  "magic-wan": Object.freeze({
    id: "cloudflare.perm.magic-wan",
    category: "network",
    label: "Magic Wan",
    oauthScopes: Object.freeze(["magic-wan.read","magic-wan.write"]),
  }),
  "managed-headers": Object.freeze({
    id: "cloudflare.perm.managed-headers",
    category: "rules",
    label: "Managed Headers",
    oauthScopes: Object.freeze(["managed-headers.read","managed-headers.write"]),
  }),
  "mass-url-redirects": Object.freeze({
    id: "cloudflare.perm.mass-url-redirects",
    category: "rules",
    label: "Mass Url Redirects",
    oauthScopes: Object.freeze(["mass-url-redirects.read","mass-url-redirects.write"]),
  }),
  "mcp-portals": Object.freeze({
    id: "cloudflare.perm.mcp-portals",
    category: "developer_platform",
    label: "Mcp Portals",
    oauthScopes: Object.freeze(["mcp-portals.read","mcp-portals.write"]),
  }),
  "memberships": Object.freeze({
    id: "cloudflare.perm.memberships",
    category: "account",
    label: "Memberships",
    oauthScopes: Object.freeze(["memberships.read","memberships.write"]),
  }),
  "messaging": Object.freeze({
    id: "cloudflare.perm.messaging",
    category: "developer_platform",
    label: "Messaging",
    oauthScopes: Object.freeze(["messaging.edit","messaging.read"]),
  }),
  "moq": Object.freeze({
    id: "cloudflare.perm.moq",
    category: "media",
    label: "Moq",
    oauthScopes: Object.freeze(["moq.read","moq.write"]),
  }),
  "notifications": Object.freeze({
    id: "cloudflare.perm.notifications",
    category: "account",
    label: "Notifications",
    oauthScopes: Object.freeze(["notifications.read","notifications.write"]),
  }),
  "offline_access": Object.freeze({
    id: "cloudflare.perm.offline_access",
    category: "account",
    label: "Offline_access",
    oauthScopes: Object.freeze(["offline_access"]),
  }),
  "origin": Object.freeze({
    id: "cloudflare.perm.origin",
    category: "rules",
    label: "Origin",
    oauthScopes: Object.freeze(["origin.read","origin.write"]),
  }),
  "page": Object.freeze({
    id: "cloudflare.perm.page",
    category: "developer_platform",
    label: "Page",
    oauthScopes: Object.freeze(["page.read","page.write"]),
  }),
  "payments-gateway": Object.freeze({
    id: "cloudflare.perm.payments-gateway",
    category: "rules",
    label: "Payments Gateway",
    oauthScopes: Object.freeze(["payments-gateway.read","payments-gateway.write"]),
  }),
  "pcaps-api": Object.freeze({
    id: "cloudflare.perm.pcaps-api",
    category: "network",
    label: "Pcaps Api",
    oauthScopes: Object.freeze(["pcaps-api.read","pcaps-api.write"]),
  }),
  "pipelines": Object.freeze({
    id: "cloudflare.perm.pipelines",
    category: "developer_platform",
    label: "Pipelines",
    oauthScopes: Object.freeze(["pipelines.read","pipelines.send","pipelines.write"]),
  }),
  "pubsub": Object.freeze({
    id: "cloudflare.perm.pubsub",
    category: "developer_platform",
    label: "Pubsub",
    oauthScopes: Object.freeze(["pubsub.read","pubsub.write"]),
  }),
  "query-cache": Object.freeze({
    id: "cloudflare.perm.query-cache",
    category: "developer_platform",
    label: "Query Cache",
    oauthScopes: Object.freeze(["query-cache.read","query-cache.write"]),
  }),
  "queues": Object.freeze({
    id: "cloudflare.perm.queues",
    category: "developer_platform",
    label: "Queues",
    oauthScopes: Object.freeze(["queues.read","queues.write"]),
  }),
  "r2-catalog": Object.freeze({
    id: "cloudflare.perm.r2-catalog",
    category: "developer_platform",
    label: "R2 Catalog",
    oauthScopes: Object.freeze(["r2-catalog.read","r2-catalog.write"]),
  }),
  "r2-catalog-sql": Object.freeze({
    id: "cloudflare.perm.r2-catalog-sql",
    category: "developer_platform",
    label: "R2 Catalog Sql",
    oauthScopes: Object.freeze(["r2-catalog-sql.read"]),
  }),
  "radar": Object.freeze({
    id: "cloudflare.perm.radar",
    category: "analytics",
    label: "Radar",
    oauthScopes: Object.freeze(["radar.read"]),
  }),
  "rag": Object.freeze({
    id: "cloudflare.perm.rag",
    category: "ai",
    label: "Rag",
    oauthScopes: Object.freeze(["rag.read","rag.write","rag.run"]),
  }),
  "realtime": Object.freeze({
    id: "cloudflare.perm.realtime",
    category: "developer_platform",
    label: "Realtime",
    oauthScopes: Object.freeze(["realtime.write","realtime.admin","realtime.read"]),
  }),
  "registrar-domains": Object.freeze({
    id: "cloudflare.perm.registrar-domains",
    category: "dns_zones",
    label: "Registrar Domains",
    oauthScopes: Object.freeze(["registrar-domains.admin","registrar-domains.read"]),
  }),
  "registrar-sandbox-domains": Object.freeze({
    id: "cloudflare.perm.registrar-sandbox-domains",
    category: "dns_zones",
    label: "Registrar Sandbox Domains",
    oauthScopes: Object.freeze(["registrar-sandbox-domains.admin","registrar-sandbox-domains.read"]),
  }),
  "reports-application-security-report": Object.freeze({
    id: "cloudflare.perm.reports-application-security-report",
    category: "app_security",
    label: "Reports Application Security Report",
    oauthScopes: Object.freeze(["reports-application-security-report.read"]),
  }),
  "request-tracer": Object.freeze({
    id: "cloudflare.perm.request-tracer",
    category: "app_security",
    label: "Request Tracer",
    oauthScopes: Object.freeze(["request-tracer.read"]),
  }),
  "resource-library": Object.freeze({
    id: "cloudflare.perm.resource-library",
    category: "other",
    label: "Resource Library",
    oauthScopes: Object.freeze(["resource-library.read","resource-library.write"]),
  }),
  "resource-sharing": Object.freeze({
    id: "cloudflare.perm.resource-sharing",
    category: "other",
    label: "Resource Sharing",
    oauthScopes: Object.freeze(["resource-sharing.read"]),
  }),
  "scim-provisioning": Object.freeze({
    id: "cloudflare.perm.scim-provisioning",
    category: "account",
    label: "Scim Provisioning",
    oauthScopes: Object.freeze(["scim-provisioning.write"]),
  }),
  "secrets-store": Object.freeze({
    id: "cloudflare.perm.secrets-store",
    category: "developer_platform",
    label: "Secrets Store",
    oauthScopes: Object.freeze(["secrets-store.read","secrets-store.write"]),
  }),
  "ssl-and-certificates": Object.freeze({
    id: "cloudflare.perm.ssl-and-certificates",
    category: "cache",
    label: "Ssl And Certificates",
    oauthScopes: Object.freeze(["ssl-and-certificates.read","ssl-and-certificates.write"]),
  }),
  "stream": Object.freeze({
    id: "cloudflare.perm.stream",
    category: "media",
    label: "Stream",
    oauthScopes: Object.freeze(["stream.read","stream.write"]),
  }),
  "tag": Object.freeze({
    id: "cloudflare.perm.tag",
    category: "app_security",
    label: "Tag",
    oauthScopes: Object.freeze(["tag.read","tag.write"]),
  }),
  "teams": Object.freeze({
    id: "cloudflare.perm.teams",
    category: "zero_trust",
    label: "Teams",
    oauthScopes: Object.freeze(["teams.read","teams.report","teams.write"]),
  }),
  "teams-cds-compute-account": Object.freeze({
    id: "cloudflare.perm.teams-cds-compute-account",
    category: "zero_trust",
    label: "Teams Cds Compute Account",
    oauthScopes: Object.freeze(["teams-cds-compute-account.read","teams-cds-compute-account.write"]),
  }),
  "teams-connector-cloudflared": Object.freeze({
    id: "cloudflare.perm.teams-connector-cloudflared",
    category: "zero_trust",
    label: "Teams Connector Cloudflared",
    oauthScopes: Object.freeze(["teams-connector-cloudflared.monitoring","teams-connector-cloudflared.read","teams-connector-cloudflared.write"]),
  }),
  "teams-connector-warp": Object.freeze({
    id: "cloudflare.perm.teams-connector-warp",
    category: "zero_trust",
    label: "Teams Connector Warp",
    oauthScopes: Object.freeze(["teams-connector-warp.read","teams-connector-warp.write"]),
  }),
  "teams-connectors": Object.freeze({
    id: "cloudflare.perm.teams-connectors",
    category: "zero_trust",
    label: "Teams Connectors",
    oauthScopes: Object.freeze(["teams-connectors.read","teams-connectors.write"]),
  }),
  "teams-dex": Object.freeze({
    id: "cloudflare.perm.teams-dex",
    category: "zero_trust",
    label: "Teams Dex",
    oauthScopes: Object.freeze(["teams-dex.read","teams-dex.write"]),
  }),
  "teams-networks": Object.freeze({
    id: "cloudflare.perm.teams-networks",
    category: "zero_trust",
    label: "Teams Networks",
    oauthScopes: Object.freeze(["teams-networks.read","teams-networks.write"]),
  }),
  "teams-pii": Object.freeze({
    id: "cloudflare.perm.teams-pii",
    category: "zero_trust",
    label: "Teams Pii",
    oauthScopes: Object.freeze(["teams-pii.read"]),
  }),
  "teams-resilience": Object.freeze({
    id: "cloudflare.perm.teams-resilience",
    category: "zero_trust",
    label: "Teams Resilience",
    oauthScopes: Object.freeze(["teams-resilience.read","teams-resilience.write"]),
  }),
  "teams-secure": Object.freeze({
    id: "cloudflare.perm.teams-secure",
    category: "zero_trust",
    label: "Teams Secure",
    oauthScopes: Object.freeze(["teams-secure.location"]),
  }),
  "url-scanner": Object.freeze({
    id: "cloudflare.perm.url-scanner",
    category: "app_security",
    label: "Url Scanner",
    oauthScopes: Object.freeze(["url-scanner.read","url-scanner.write"]),
  }),
  "user-details": Object.freeze({
    id: "cloudflare.perm.user-details",
    category: "account",
    label: "User Details",
    oauthScopes: Object.freeze(["user-details.read"]),
  }),
  "vectorize": Object.freeze({
    id: "cloudflare.perm.vectorize",
    category: "developer_platform",
    label: "Vectorize",
    oauthScopes: Object.freeze(["vectorize.read","vectorize.write"]),
  }),
  "waiting-rooms": Object.freeze({
    id: "cloudflare.perm.waiting-rooms",
    category: "network",
    label: "Waiting Rooms",
    oauthScopes: Object.freeze(["waiting-rooms.read","waiting-rooms.write"]),
  }),
  "web3-hostnames": Object.freeze({
    id: "cloudflare.perm.web3-hostnames",
    category: "network",
    label: "Web3 Hostnames",
    oauthScopes: Object.freeze(["web3-hostnames.read","web3-hostnames.write"]),
  }),
  "websearch": Object.freeze({
    id: "cloudflare.perm.websearch",
    category: "ai",
    label: "Websearch",
    oauthScopes: Object.freeze(["websearch.read","websearch.run","websearch.write"]),
  }),
  "workers-ci": Object.freeze({
    id: "cloudflare.perm.workers-ci",
    category: "developer_platform",
    label: "Workers Ci",
    oauthScopes: Object.freeze(["workers-ci.read","workers-ci.write"]),
  }),
  "workers-kv-storage": Object.freeze({
    id: "cloudflare.perm.workers-kv-storage",
    category: "developer_platform",
    label: "Workers Kv Storage",
    oauthScopes: Object.freeze(["workers-kv-storage.read","workers-kv-storage.write"]),
  }),
  "workers-observability": Object.freeze({
    id: "cloudflare.perm.workers-observability",
    category: "developer_platform",
    label: "Workers Observability",
    oauthScopes: Object.freeze(["workers-observability.read","workers-observability.write"]),
  }),
  "workers-observability-telemetry": Object.freeze({
    id: "cloudflare.perm.workers-observability-telemetry",
    category: "developer_platform",
    label: "Workers Observability Telemetry",
    oauthScopes: Object.freeze(["workers-observability-telemetry.write"]),
  }),
  "workers-r2": Object.freeze({
    id: "cloudflare.perm.workers-r2",
    category: "developer_platform",
    label: "Workers R2",
    oauthScopes: Object.freeze(["workers-r2.read","workers-r2.write"]),
  }),
  "workers-r2-bucket-item": Object.freeze({
    id: "cloudflare.perm.workers-r2-bucket-item",
    category: "developer_platform",
    label: "Workers R2 Bucket Item",
    oauthScopes: Object.freeze(["workers-r2-bucket-item.read","workers-r2-bucket-item.write"]),
  }),
  "workers-routes": Object.freeze({
    id: "cloudflare.perm.workers-routes",
    category: "developer_platform",
    label: "Workers Routes",
    oauthScopes: Object.freeze(["workers-routes.read","workers-routes.write"]),
  }),
  "workers-scripts": Object.freeze({
    id: "cloudflare.perm.workers-scripts",
    category: "developer_platform",
    label: "Workers Scripts",
    oauthScopes: Object.freeze(["workers-scripts.read","workers-scripts.write"]),
  }),
  "workers-tail": Object.freeze({
    id: "cloudflare.perm.workers-tail",
    category: "developer_platform",
    label: "Workers Tail",
    oauthScopes: Object.freeze(["workers-tail.read"]),
  }),
  "zone": Object.freeze({
    id: "cloudflare.perm.zone",
    category: "dns_zones",
    label: "Zone",
    oauthScopes: Object.freeze(["zone.read","zone.write"]),
  }),
  "zone-access": Object.freeze({
    id: "cloudflare.perm.zone-access",
    category: "zero_trust",
    label: "Zone Access",
    oauthScopes: Object.freeze(["zone-access.read","zone-access.revoke","zone-access.write"]),
  }),
  "zone-custom-asset": Object.freeze({
    id: "cloudflare.perm.zone-custom-asset",
    category: "dns_zones",
    label: "Zone Custom Asset",
    oauthScopes: Object.freeze(["zone-custom-asset.read","zone-custom-asset.write"]),
  }),
  "zone-dns-settings": Object.freeze({
    id: "cloudflare.perm.zone-dns-settings",
    category: "dns_zones",
    label: "Zone Dns Settings",
    oauthScopes: Object.freeze(["zone-dns-settings.read","zone-dns-settings.write"]),
  }),
  "zone-observability": Object.freeze({
    id: "cloudflare.perm.zone-observability",
    category: "analytics",
    label: "Zone Observability",
    oauthScopes: Object.freeze(["zone-observability.read","zone-observability.write"]),
  }),
  "zone-security-center-insights": Object.freeze({
    id: "cloudflare.perm.zone-security-center-insights",
    category: "app_security",
    label: "Zone Security Center Insights",
    oauthScopes: Object.freeze(["zone-security-center-insights.read","zone-security-center-insights.write"]),
  }),
  "zone-settings": Object.freeze({
    id: "cloudflare.perm.zone-settings",
    category: "dns_zones",
    label: "Zone Settings",
    oauthScopes: Object.freeze(["zone-settings.read","zone-settings.write"]),
  }),
  "zone-versioning": Object.freeze({
    id: "cloudflare.perm.zone-versioning",
    category: "dns_zones",
    label: "Zone Versioning",
    oauthScopes: Object.freeze(["zone-versioning.read","zone-versioning.write"]),
  }),
  "zone-waf": Object.freeze({
    id: "cloudflare.perm.zone-waf",
    category: "app_security",
    label: "Zone Waf",
    oauthScopes: Object.freeze(["zone-waf.read","zone-waf.write"]),
  }),
});

export function listCloudflarePermissionProducts() {
  return Object.values(CLOUDFLARE_PERMISSION_PRODUCTS);
}

export function listCloudflarePermissionOptionsByCategory() {
  /** @type {Record<string, ReturnType<typeof listCloudflarePermissionProducts>>} */
  const out = {};
  for (const product of listCloudflarePermissionProducts()) {
    const cat = product.category || 'other';
    if (!out[cat]) out[cat] = [];
    out[cat].push(product);
  }
  return out;
}

/** Capability ids usable with scopesForCapabilities / authorize UI. */
export function permissionProductsAsCapabilities() {
  /** @type {Record<string, object>} */
  const caps = {};
  for (const product of listCloudflarePermissionProducts()) {
    caps[product.id] = {
      id: product.id,
      domain: product.category,
      label: product.label,
      oauthScopes: [...product.oauthScopes],
      permissionLabel: `Cloudflare → ${CLOUDFLARE_PERMISSION_CATEGORY_LABELS[product.category] || product.category} → ${product.label}`,
      availability: 'generally_available',
      offerable: true,
    };
  }
  return caps;
}

/** Feature packs = Studio categories + `all` opt-in. */
export function permissionCategoryFeaturePacks() {
  const byCat = listCloudflarePermissionOptionsByCategory();
  /** @type {Record<string, object>} */
  const packs = {
    all: {
      id: 'all',
      label: 'All Cloudflare permissions',
      description: 'Explicit opt-in to every offerable Local Studio scope (~315).',
      capabilities: Object.keys(permissionProductsAsCapabilities()),
      oauthScopes: [...CLOUDFLARE_ALL_SCOPES],
    },
  };
  for (const [cat, products] of Object.entries(byCat)) {
    packs[cat] = {
      id: cat,
      label: CLOUDFLARE_PERMISSION_CATEGORY_LABELS[cat] || cat,
      description: `Offerable scopes in ${CLOUDFLARE_PERMISSION_CATEGORY_LABELS[cat] || cat}`,
      capabilities: products.map((p) => p.id),
      oauthScopes: products.flatMap((p) => p.oauthScopes),
    };
  }
  return packs;
}

export function assertPermissionCatalogCoversAllScopes() {
  const seen = new Set();
  for (const p of listCloudflarePermissionProducts()) {
    for (const s of p.oauthScopes) seen.add(s);
  }
  const missing = CLOUDFLARE_ALL_SCOPES.filter((s) => !seen.has(s));
  if (missing.length) {
    const err = new Error(`cloudflare_permission_catalog_gap:${missing.length}`);
    err.missing = missing;
    throw err;
  }
  return { ok: true, scopes: seen.size, products: Object.keys(CLOUDFLARE_PERMISSION_PRODUCTS).length };
}
