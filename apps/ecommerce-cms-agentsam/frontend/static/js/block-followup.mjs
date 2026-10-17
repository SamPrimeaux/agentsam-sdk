import { lintGeneratedBlock, nsForms, resolveUidToken } from "./generation-namespace.mjs";

export function applyReplacements(code, edits) {
  const next = { html: code.html || "", css: code.css || "", js: code.js || "" };
  (edits || []).forEach(function(edit) {
    const surface = next[edit.section] || "";
    if (!surface.includes(edit.search)) throw new Error("replacement missed");
    next[edit.section] = surface.replace(edit.search, edit.replace);
  });
  return next;
}

export function selectorsStable(before, after) {
  const read = (value) => (value || "").match(/agentsam-gen-[a-z0-9-]+/g) || [];
  return read(before.css).join() === read(after.css).join();
}

export async function followUp(store, input) {
  const block = await store.loadBlock(input.accountId, input.blockId);
  const canonical = input.canonical || JSON.parse(await input.objects.get(block.artifact_key || input.artifactKey));
  const edited = applyReplacements(canonical, input.edits);
  if (!input.rename && !selectorsStable(canonical, edited)) return { ok: false, error: "selectors changed" };
  const forms = nsForms(input.blockKey || input.blockId, input.namespace);
  const resolved = { html: resolveUidToken(edited.html, forms.blockId, input.namespace), css: resolveUidToken(edited.css, forms.blockId, input.namespace), js: resolveUidToken(edited.js, forms.blockId, input.namespace) };
  const lint = lintGeneratedBlock(resolved, forms);
  if (!lint.ok) return { ok: false, error: lint.violations.join("; ") };
  const saved = await store.saveGenerated({
    accountId: input.accountId,
    sectionId: input.sectionId,
    blockId: input.blockId,
    blockKey: input.blockKey,
    manifest: { canonical: edited, generation: input.generation || {}, cms: input.cms },
    settingsValues: input.settingsValues || {},
    provenance: input.provenance,
  });
  return { ok: saved.ok, saved, canonical: edited };
}

export function undoLast(store, accountId, blockId) {
  return store.restoreRevision(accountId, blockId, 1);
}
