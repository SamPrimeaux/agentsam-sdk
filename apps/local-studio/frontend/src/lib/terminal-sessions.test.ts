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
const { useTerminalSessionStore } = await import("./work/terminal-sessions.ts");

const store = useTerminalSessionStore;
beforeEach(() => {
  store.setState({
    sessions: [{
      id: "term_local_1", title: "Terminal", connectionId: "runtime-auto",
      lane: "local", ptySlot: 0, state: "disconnected",
    }],
    activeSessionId: "term_local_1",
    splitView: false,
    secondarySessionId: null,
    gridView: false,
    gridSessionIds: [],
  });
});

test("five independent sessions can be tiled without duplicated mounts", () => {
  store.getState().setGridView(true);
  assert.deepEqual(store.getState().gridSessionIds, ["term_local_1"]);
  for (let i = 0; i < 4; i++) store.getState().createSession();
  const state = store.getState();
  assert.equal(state.gridSessionIds.length, 5);
  assert.equal(new Set(state.gridSessionIds).size, 5);
  assert.equal(state.activeSessionId, state.gridSessionIds.at(-1));
  assert.equal(state.splitView, false);
});

test("replacing a tile keeps five unique sessions and preserves existing PTYs", () => {
  store.getState().setGridView(true);
  for (let i = 0; i < 5; i++) store.getState().createSession();
  const sixth = store.getState().activeSessionId;
  assert.ok(store.getState().gridSessionIds.includes(sixth));
  const initialCount = store.getState().sessions.length;
  store.getState().setGridSession(1, "term_local_1");
  assert.equal(new Set(store.getState().gridSessionIds).size, 5);
  assert.equal(store.getState().gridSessionIds[1], "term_local_1");
  assert.equal(store.getState().sessions.length, initialCount);
});

test("closing a tile removes its visibility without deleting another session", () => {
  store.getState().setGridView(true);
  const a = store.getState().createSession();
  const b = store.getState().createSession();
  store.getState().closeSession(a);
  assert.deepEqual(store.getState().gridSessionIds, ["term_local_1", b]);
  assert.ok(store.getState().sessions.some((s) => s.id === b));
});

test("returning to split or single layout preserves terminal sessions", () => {
  const second = store.getState().createSession();
  store.getState().setGridView(true);
  store.getState().setSplitView(true);
  assert.equal(store.getState().gridView, false);
  assert.equal(store.getState().splitView, true);
  store.getState().setSplitView(false);
  assert.equal(store.getState().splitView, false);
  assert.equal(store.getState().sessions.length, 2);
  assert.equal(store.getState().activeSessionId, second);
});
