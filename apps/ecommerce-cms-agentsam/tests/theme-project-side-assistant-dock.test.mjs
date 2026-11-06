import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, "../frontend/static/js/agentsam.js"), "utf8");
const css = readFileSync(resolve(here, "../frontend/static/css/agentsam.css"), "utf8");
const mountCode = source.slice(source.indexOf("function agentsamMount()"),
  source.indexOf("function renderMcpBanner("));

function simulate({ embedded = false, existingDock = false, editor = true,
  wide = true } = {}) {
  const nodes = [];
  function element(tag) {
    const node = { tag, id: "", className: "", children: [], parentElement: null,
      attrs: {}, html: "",
      appendChild(child) {
        if (child.parentElement) child.parentElement.children =
          child.parentElement.children.filter(item => item !== child);
        this.children.push(child);
        child.parentElement = this;
        return child;
      },
      setAttribute(key, value) { this.attrs[key] = value; },
      insertAdjacentElement(where, child) {
        const parent = this.parentElement;
        if (!parent) throw new Error("element must have a parent");
        const index = parent.children.indexOf(this);
        parent.children.splice(index + (where === "afterend" ? 1 : 0), 0, child);
        child.parentElement = parent;
      },
      insertAdjacentHTML(_position, html) { this.html = html; }
    };
    nodes.push(node);
    return node;
  }
  const body = element("body");
  body.hasAttribute = key => key === "data-theme-editor-embedded" && embedded;
  body.classNames = new Set();
  body.classList = { toggle: (name, enabled) => {
    if (enabled) body.classNames.add(name); else body.classNames.delete(name);
  }};
  const studio = editor ? element("div") : null;
  if (studio) { studio.className = "theme-studio"; body.appendChild(studio); }
  const dock = existingDock ? element("aside") : null;
  if (dock) { dock.id = "agentsam-dock"; body.appendChild(dock); }
  const find = (id) => nodes.find(node => node.id === id) || null;
  const document = { body, createElement: element,
    getElementById: find,
    querySelector: selector => selector === ".theme-studio" ? studio : null
  };
  const env = { document, location: { pathname: "/admin/theme-project-editor" },
    window: { matchMedia: () => ({ matches: wide }) },
    ASSISTANT_NEW_CHAT_ICON: "", ASSISTANT_EXPAND_ICON: "" };
  vm.runInNewContext(mountCode + "\nrenderAgentsamShell();", env);
  return { studio, body, dock: find("agentsam-dock"), nodes };
}

test("embedded Theme Project Editor mounts in-flow beside the original Canvas", () => {
  const { studio, body, dock } = simulate({ embedded: true });
  assert.ok(dock);
  assert.equal(studio.parentElement.className, "theme-studio-assistant-layout");
  assert.equal(dock.parentElement, studio.parentElement);
  assert.equal(studio.parentElement.parentElement, body);
  assert.equal(dock.attrs["aria-hidden"], "true");
  assert.match(dock.html, /agentsam-drawer/);
  assert.doesNotMatch(dock.html, /agentsam-backdrop/);
  assert.equal(body.classNames.has("agentsam-overlay-mode"), false);
});

test("the same dock contract mounts at narrow viewport; CSS owns sheet layout", () => {
  const { studio, dock, body } = simulate({ embedded: true, wide: false });
  assert.equal(dock.parentElement, studio.parentElement);
  assert.equal(body.classNames.has("agentsam-overlay-mode"), false);
  assert.match(css, /theme-studio-assistant-layout\s*>\s*\.agentsam-dock/);
  assert.match(css, /max-width:\s*900px/);
});

test("existing console dock remains authoritative", () => {
  const { body, dock } = simulate({ existingDock: true, embedded: false });
  assert.equal(dock.parentElement, body);
  assert.equal(body.classNames.has("agentsam-overlay-mode"), false);
});

test("pages with no editor or dock retain an explicitly scoped overlay fallback", () => {
  const { body, dock } = simulate({ editor: false, embedded: false });
  assert.equal(dock, null);
  assert.equal(body.classNames.has("agentsam-overlay-mode"), true);
  assert.match(body.html, /agentsam-backdrop/);
});

test("focus mode can temporarily present the assistant without remounting the Canvas", () => {
  assert.match(css, /agentsam-focus-mode\s+\.theme-studio-assistant-layout\s*>\s*\.theme-studio\s*\{\s*display:\s*none/);
  assert.match(css, /\.theme-studio-assistant-layout\s*>\s*\.theme-studio/);
});
