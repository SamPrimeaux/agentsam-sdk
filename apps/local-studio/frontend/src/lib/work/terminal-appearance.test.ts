import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

const data = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  },
  configurable: true,
});

const appearance = await import("./terminal-appearance.ts");
const { THEME_PRESETS } = await import("./theme.ts");

const store = appearance.useTerminalAppearanceStore;
const tokens = THEME_PRESETS["studio-dark"].tokens;

beforeEach(() => {
  data.clear();
  store.setState({ defaultProfileId: "cms", sessions: {} });
});

test("theme default reproduces the previous Studio terminal palette", () => {
  const resolved = appearance.resolveAppearance({ tokens, defaultProfileId: "cms" });
  assert.equal(resolved.theme.background.toLowerCase(), "#070708");
  assert.equal(resolved.theme.foreground.toLowerCase(), "#f3f1ec");
  assert.equal(resolved.theme.cursor.toLowerCase(), "#c4b8a8");
  assert.equal(resolved.fontSize, 12.5);
  assert.equal(resolved.fontId, "system");
  assert.match(resolved.fontFamily, /ui-monospace/);
  assert.equal(resolved.lineHeight, 1.35);
  assert.ok(resolved.contrast >= 4.5);
  assert.equal(resolved.customized, false);
});

test("font selection is validated, live per session, and can become the default", () => {
  store.getState().patchSession("one", { fontId: "menlo" });
  store.getState().patchSession("two", { fontId: "not-a-font" as never });
  assert.equal(appearance.resolveSessionAppearance("one").fontId, "menlo");
  assert.equal(appearance.resolveSessionAppearance("two").fontId, "system");
  store.getState().setDefaultFont("jetbrains");
  assert.equal(appearance.resolveSessionAppearance("two").fontId, "jetbrains");
  assert.equal(appearance.resolveSessionAppearance("one").fontId, "menlo");
  store.getState().setProfile("one", "remote");
  assert.equal(appearance.resolveSessionAppearance("one").fontId, "menlo");
  assert.match(appearance.resolveSessionAppearance("one").fontFamily, /Menlo/);
});

test("lane profiles keep their published terminal palette contract", () => {
  for (const [id, background, primary] of [
    ["local", "#0d0900", "#f59e0b"],
    ["remote", "#000d0b", "#22d3c8"],
    ["sandbox", "#06020d", "#a78bfa"],
  ] as const) {
    const palette = appearance.lanePalette(id);
    assert.equal(palette.background, background);
    assert.equal(palette.cursor, primary);
  }
});

test("changing one session never recolors another session or the default", () => {
  store.getState().patchSession("term_1", { background: "#112233" });
  store.getState().patchSession("term_3", { background: "#445566", fontSize: 18 });
  const t1 = appearance.resolveSessionAppearance("term_1");
  const t2 = appearance.resolveSessionAppearance("term_2");
  const t3 = appearance.resolveSessionAppearance("term_3");
  assert.equal(t1.theme.background, "#112233");
  assert.equal(t3.theme.background, "#445566");
  assert.equal(t3.fontSize, 18);
  assert.equal(t2.theme.background.toLowerCase(), "#070708");
  assert.equal(t1.fontSize, 12.5);
  store.getState().resetSession("term_3");
  assert.equal(appearance.resolveSessionAppearance("term_3").theme.background.toLowerCase(), "#070708");
  assert.equal(appearance.resolveSessionAppearance("term_1").theme.background, "#112233");
});

test("named profile overrides default; default profile applies to sessions without override", () => {
  store.getState().setDefaultProfile("remote");
  assert.equal(appearance.resolveSessionAppearance("a").profileId, "remote");
  store.getState().setProfile("b", "sandbox");
  assert.equal(appearance.resolveSessionAppearance("b").profileId, "sandbox");
  assert.equal(appearance.resolveSessionAppearance("a").profileId, "remote");
});

test("custom backgrounds keep text readable and invalid input is ignored", () => {
  const light = appearance.resolveAppearance({ tokens, defaultProfileId: "cms", override: { background: "#ffffff" } });
  assert.ok(light.contrast >= 4.5, `contrast ${light.contrast}`);
  assert.ok(light.contrast > 4.5 && light.theme.foreground !== "#f3f1ec");
  store.getState().patchSession("x", { background: "not-a-color", fontSize: Number.NaN });
  assert.deepEqual(store.getState().sessions.x, {});
  assert.equal(appearance.clampFontSize(99), 24);
  assert.equal(appearance.clampFontSize(2), 10);
  assert.equal(appearance.clampLineHeight(5), 2);
});

test("explicit foreground wins; contrast math matches WCAG", () => {
  assert.equal(Math.round(appearance.contrastRatio("#000000", "#ffffff")), 21);
  const resolved = appearance.resolveAppearance({ tokens, defaultProfileId: "cms", override: { foreground: "#ff0000" } });
  assert.equal(resolved.theme.foreground, "#ff0000");
});

test("overrides persist and rehydrate across a restart; closed sessions are pruned", async () => {
  store.getState().patchSession("keep", { background: "#102030", lineHeight: 1.6, fontId: "plex" });
  store.getState().setDefaultFont("jetbrains");
  store.getState().patchSession("gone", { background: "#aa0000" });
  store.getState().setDefaultProfile("local");
  store.getState().prune(["keep"]);
  const saved = JSON.parse(data.get("agentsam-terminal-appearance-v1") ?? "{}");
  assert.equal(saved.state.defaultProfileId, "local");
  assert.equal(saved.state.defaultFontId, "jetbrains");
  assert.deepEqual(Object.keys(saved.state.sessions), ["keep"]);

  store.setState({ defaultProfileId: "cms", sessions: {} }); // simulate fresh process memory
  data.set("agentsam-terminal-appearance-v1", JSON.stringify(saved));
  await store.persist.rehydrate();
  assert.equal(store.getState().defaultProfileId, "local");
  assert.equal(appearance.resolveSessionAppearance("keep").theme.background, "#102030");
  assert.equal(appearance.resolveSessionAppearance("keep").lineHeight, 1.6);
  assert.equal(appearance.resolveSessionAppearance("keep").fontId, "plex");
  assert.equal(appearance.resolveSessionAppearance("new").fontId, "jetbrains");
});

test("watchSessionAppearance fires only for its own session", () => {
  const seen: string[] = [];
  const stop = appearance.watchSessionAppearance("one", (next) => seen.push(next.theme.background));
  store.getState().patchSession("two", { background: "#123456" });
  assert.deepEqual(seen, []);
  store.getState().patchSession("one", { background: "#654321" });
  assert.deepEqual(seen, ["#654321"]);
  stop();
  store.getState().patchSession("one", { background: "#000001" });
  assert.deepEqual(seen, ["#654321"]);
});
