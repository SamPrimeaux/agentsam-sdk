import { acceptGeneratedBlock, createTokenResolver, nsForms } from "./generation-namespace.mjs";

export const SECTION_ORDER = ["definition", "markup", "css", "js", "settings"];
export const PHASE_LABELS = {
  definition: "Defining section",
  markup: "Writing markup",
  css: "Styling",
  js: "Adding motion",
  settings: "Defining settings",
  checking: "Checking",
  repairing: "Repairing",
  ready: "Ready",
  error: "Error",
};
export const GENERATION_PROMPT_PREFIX = [
  "Output tagged sections in order: <<<definition>>>, <<<markup>>>, <<<css>>>, <<<js>>>, <<<settings>>>.",
  "In <<<definition>>> emit one JSON object with kind='section', a stable kebab-case semantic type, a merchant-facing label, and optional settings schema.",
  "Write the literal token __UID__ in every generated id, class, custom element and CSS variable.",
  "The root must be <section data-agentsam-block=\"__UID__\">, and EVERY CSS selector must begin with [data-agentsam-block=\"__UID__\"].",
  "Do not add a namespace yourself; the installed renderer resolves __UID__ per instance.",
  "For this release the <<<js>>> section MUST be empty. Do not emit script tags, event handlers, inline styles, eval, fetch, or external assets.",
  "Use only structural HTML, scoped CSS and same-site relative links/images. No global selectors or CSS imports.",
  "Declare definition.settings as typed fields (type, label, numeric bounds, select options, and optional default). The settings lines are instance values only; never infer public schema from sample values.",
  "Use data-cms=\"key\" for content/attribute settings, or var(--__UID__-setting-key) in scoped CSS for visual settings (padding, color, font-role, etc.). Every declared setting must have exactly one supported binding.",
  "Always preserve the existing semantic type when the request revises a generated section.",
].join(" ");

export function parseGeneratedDefinition(text, fallback = {}) {
  let parsed = {};
  try {
    parsed = JSON.parse(String(text || "").trim() || "{}");
  } catch {
    parsed = {};
  }
  const kind = parsed.kind === "block" ? "block" : "section";
  const type = String(parsed.type || fallback.type || "generated-section").trim().toLowerCase();
  const safeType = /^[a-z][a-z0-9-]{1,63}$/.test(type) ? type : "generated-section";
  const label = String(parsed.label || fallback.label || safeType.replace(/-/g, " ")).trim();
  return {
    kind,
    type: safeType,
    label,
    settings:
      parsed.settings && typeof parsed.settings === "object"
        ? parsed.settings
        : parsed.settingsSchema && typeof parsed.settingsSchema === "object"
          ? parsed.settingsSchema
          : {},
    blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
  };
}

export function parseGeneratedSettings(text) {
  const out = {};
  String(text || "").split(/\r?\n/).forEach(function(line) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index <= 0) return;
    const key = trimmed.slice(0, index).trim();
    const raw = trimmed.slice(index + 1).trim();
    if (!key) return;
    if (/^(true|false)$/i.test(raw)) {
      out[key] = raw.toLowerCase() === "true";
      return;
    }
    if (raw !== "" && Number.isFinite(Number(raw))) {
      out[key] = Number(raw);
      return;
    }
    out[key] = raw;
  });
  return out;
}

export function createPreviewSink() {
  return {
    text: "",
    append(chunk) {
      this.text += String(chunk == null ? "" : chunk);
    },
  };
}

export function createSectionParser() {
  let pending = "";
  let section = null;
  const parts = { definition: "", markup: "", css: "", js: "", settings: "" };
  return {
    parts,
    push(chunk) {
      const events = [];
      const input = pending + String(chunk || "");
      pending = "";
      let i = 0;
      while (i < input.length) {
        const open = input.indexOf("<<<", i);
        if (open === -1) {
          const rest = input.slice(i);
          if (rest.endsWith("<") || rest.endsWith("<<")) {
            // A delimiter may split as `<<` + `<settings>>>`. Preserve
            // BOTH leading brackets rather than dropping the first one.
            const suffixLength = rest.endsWith('<<') ? 2 : 1;
            pending = rest.slice(-suffixLength);
            const head = rest.slice(0, -suffixLength);
            if (section && head) {
              parts[section] += head;
              events.push({ section, text: head });
            }
          } else if (section && rest) {
            parts[section] += rest;
            events.push({ section, text: rest });
          }
          break;
        }
        if (open > i && section) {
          const text = input.slice(i, open);
          parts[section] += text;
          events.push({ section, text });
        }
        const close = input.indexOf(">>>", open + 3);
        if (close === -1) {
          pending = input.slice(open);
          break;
        }
        const name = input.slice(open + 3, close).trim();
        if (SECTION_ORDER.includes(name)) {
          section = name;
          events.push({ section, phase: PHASE_LABELS[name], text: "" });
        }
        i = close + 3;
      }
      return events;
    },
  };
}

export function createGenerationSession(options) {
  const controller = new AbortController();
  const sink = options.sink || createPreviewSink();
  const parser = createSectionParser();
  const resolver = createTokenResolver(options.blockId, options.namespace);
  let aborted = false;
  let record = null;
  const phases = [];
  return {
    id: options.id,
    signal: controller.signal,
    sink,
    phases,
    aborted() { return aborted; },
    record() { return record; },
    abort() {
      aborted = true;
      controller.abort();
      if (options.onAbort) options.onAbort();
    },
    async run() {
      return options.lock.run(options.id, async () => {
        try {
          const transport = options.transport;
          const consumeChunk = (chunk) => {
            if (aborted) return;
            for (const event of parser.push(chunk)) {
              if (event.phase) {
                phases.push(event.phase);
                if (options.onPhase) options.onPhase(event.phase);
              }
              if (event.text) sink.append(resolver.push(event.text));
            }
          };
          const response = await transport({
            signal: controller.signal,
            promptPrefix: GENERATION_PROMPT_PREFIX,
            model: options.model || "",
            onChunk: consumeChunk,
            onPhase: options.onPhase,
          });
          const chunks = response && response.chunks ? response.chunks : [];
          for (const chunk of chunks) consumeChunk(chunk);
          sink.append(resolver.flush());
          if (aborted) return { ok: false, aborted: true, record: null, saved: false };
          phases.push(PHASE_LABELS.checking);
          // The model must emit portable __UID__ tokens; validation needs a
          // concrete, per-instance wrapper scope. Restore the tokens after
          // validation so the immutable artifact remains reusable/duplicable.
          const forms = nsForms(options.blockId,options.namespace);
          const scopedAttribute = 'data-agentsam-block="' + forms.blockId + '"';
          const scopeSelector = '[data-agentsam-block="' + forms.blockId + '"]';
          const checkedInput = {
            html: parser.parts.markup.replaceAll('data-agentsam-block="__UID__"',scopedAttribute),
            css: parser.parts.css.replaceAll('[data-agentsam-block="__UID__"]',scopeSelector),
            js: parser.parts.js,
          };
          const accepted = acceptGeneratedBlock(checkedInput, {
            blockId: options.blockId,
            namespace: options.namespace,
            model: options.model || "",
            prompt: options.prompt || "",
            repair: options.repair,
          });
          if (!accepted.ok) {
            phases.push(PHASE_LABELS.error);
            return { ok: false, saved: false, record: null, error: accepted.error, phases };
          }
          if (accepted.repaired) phases.push(PHASE_LABELS.repairing);
          record = {
            blockId: options.blockId,
            canonical: {
              html: accepted.canonical.html.replaceAll(scopedAttribute,'data-agentsam-block="__UID__"'),
              css: accepted.canonical.css.replaceAll(scopeSelector,'[data-agentsam-block="__UID__"]'),
              js: accepted.canonical.js,
            },
            provenance: { ...accepted.provenance, ...(response?.provenance || {}) },
            definition: parseGeneratedDefinition(parser.parts.definition, {
              type: options.semanticType,
              label: options.semanticLabel,
            }),
            settings: parseGeneratedSettings(parser.parts.settings),
          };
          phases.push(PHASE_LABELS.ready);
          // Generation produced a validated candidate, not a persisted draft.
          // Installation happens only after the merchant accepts the preview.
          return { ok: true, saved: false, record, phases };
        } finally {
          if (aborted) record = null;
        }
      });
    },
  };
}
