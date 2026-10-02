/**
 * Fuel n Freetime AgentSam feature gates — advanced capabilities off until paid/approved.
 */

export const FNF_AGENT_FEATURES = {
  web_search: false,
  deep_research: false,
  pdf_extraction: false,
  image_upload: true,
  image_generation: true,
  github_repo: true,
  mcp_bridge: true,
  store_tools: true,
  cms_tools: true,
  d1_tools: true,
  r2_tools: true,
};

export function isFeatureEnabled(feature) {
  return Boolean(FNF_AGENT_FEATURES[feature]);
}

export function getAgentFeatures() {
  return { ...FNF_AGENT_FEATURES };
}

const WEB_PATTERNS =
  /\b(search the web|web search|search online|look up current|current trends|live lookup|google it|browse the internet|internet search|look something up online)\b/i;

const RESEARCH_PATTERNS =
  /\b(deep research|deep-research|competitive research|market research|research the market|research this topic)\b/i;

const PDF_PATTERNS =
  /\b(extract (this|the|from)? ?pdf|read (this|the)? pdf|parse (this|the)? pdf|pdf extraction|ocr this|ocr the)\b/i;

export const BLOCKED_FEATURE_MESSAGES = {
  web_search:
    "Web research is not enabled for this workspace yet. I can help plan the research brief or work from information you provide.",
  deep_research:
    "Deep research is not enabled for this workspace yet. I can help plan the research brief or work from information you provide.",
  pdf_extraction:
    "PDF extraction is not enabled for this workspace yet. Upload an image or paste the text you want me to review.",
};

export function detectBlockedFeatureRequest(message, attachments = []) {
  const hay = String(message || "");

  if (
    !isFeatureEnabled("pdf_extraction") &&
    (PDF_PATTERNS.test(hay) ||
      attachments.some((a) => String(a.mime_type || "").toLowerCase() === "application/pdf"))
  ) {
    return "pdf_extraction";
  }

  if (!isFeatureEnabled("web_search") && WEB_PATTERNS.test(hay)) {
    return "web_search";
  }

  if (!isFeatureEnabled("deep_research") && RESEARCH_PATTERNS.test(hay)) {
    return "deep_research";
  }

  return null;
}

/** Tool keys that stay allowed even when they match broad search/research patterns. */
const TOOL_KEY_ALLOWLIST = new Set([
  "agentsam_github_repo_list",
  "search_cloudflare_documentation",
  "fnf_d1_query",
  "fnf_r2_list",
  "fnf_cms_read",
]);

export function isToolKeyAllowed(toolKey, displayName = "") {
  const key = String(toolKey || "").toLowerCase();
  const label = String(displayName || "").toLowerCase();
  const hay = `${key} ${label}`;

  if (TOOL_KEY_ALLOWLIST.has(toolKey)) return true;
  if (/github|repo_list|repo\.list/.test(hay)) return true;

  if (!isFeatureEnabled("web_search")) {
    if (/\bweb[_-]?search\b|\bbrowser\b|\binternet[_-]?search\b/.test(hay)) return false;
  }

  if (!isFeatureEnabled("deep_research")) {
    if (/\bdeep[_-]?research\b|\bmarket[_-]?research\b/.test(hay)) return false;
  }

  if (!isFeatureEnabled("pdf_extraction")) {
    if (/\bpdf\b|\bocr\b|\bextract(ion)?\b/.test(hay) && !/cloudflare/.test(hay)) {
      if (/pdf|ocr/.test(hay)) return false;
    }
  }

  return true;
}

export function isQuickActionAllowed(action) {
  if (!action) return false;
  const id = String(action.id || "").toLowerCase();
  const label = String(action.label || "").toLowerCase();
  if (/web|research|pdf|lookup online|look something up/.test(`${id} ${label}`)) {
    if (label.includes("look something up") && !isFeatureEnabled("web_search")) return false;
    if (/research|web|pdf/.test(`${id} ${label}`)) return false;
  }
  return true;
}
