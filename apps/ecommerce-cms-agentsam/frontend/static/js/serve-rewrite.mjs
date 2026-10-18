import { resolveUidToken } from "./generation-namespace.mjs";

export function createTokenTextHandler(blockId, namespace) {
  let buffer = "";
  const resolved = [];
  return {
    resolved,
    text(text) {
      buffer += text.text || "";
      if (!text.lastInTextNode) return;
      resolved.push(resolveUidToken(buffer, blockId, namespace));
      buffer = "";
    },
  };
}

export function guardHandler(handler) {
  return {
    element(element) {
      try { if (handler.element) handler.element(element); }
      catch (error) { element.remove(); }
    },
    text(text) {
      try { if (handler.text) handler.text(text); }
      catch (error) { text.remove(); }
    },
  };
}

export function insertOptions(lintPassed) {
  return { html: Boolean(lintPassed) };
}
