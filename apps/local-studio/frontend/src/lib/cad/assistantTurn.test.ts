import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCadAssistantPrompt, runCadAssistantTurn } from "./assistantTurn.ts";

function fakeStore(options: { existing?: boolean; busy?: boolean; offline?: boolean; failed?: boolean } = {}) {
  const subscribers = new Set<(state: any) => void>();
  const state: any = {
    sideTabs: options.existing ? [{ id: "cad-tab", kind: "chat", title: "CAD AgentSam", messages: [] }] : [],
    streamingIds: options.busy ? ["cad-tab"] : [],
    offlineQueue: [],
    pausedQueueTargets: [],
    setSideOpen: () => {},
    setActiveSideTab: () => {},
    openSideTab: (_kind: string, extra: any) => {
      state.sideTabs.push({ id: "cad-tab", kind: "chat", ...extra, messages: [] });
      return "cad-tab";
    },
    send: async (id: string, _kind: string, prompt: string) => {
      assert.match(prompt, /Use the selected revision/);
      if (options.offline) {
        state.offlineQueue.push({ targetId: id });
        return;
      }
      const tab = state.sideTabs.find((row: any) => row.id === id);
      tab.messages.push({ role: "user", content: prompt }, { role: "assistant", content: "" });
      const announce = (value: string) => {
        tab.messages.at(-1).content = value;
        subscribers.forEach((fn) => fn(state));
      };
      announce("Generating");
      if (options.failed) {
        state.pausedQueueTargets.push(id);
        announce("provider_unavailable");
        return;
      }
      announce("Generating section.");
    },
  };
  return {
    getState: () => state,
    subscribe: (fn: (snapshot: any) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
    subscriptions: subscribers,
  };
}

const turn = { request_id: "cad-request-1", prompt: "Add an interior wall", selection: null };

test("CAD request preserves selection and revision without promising an unapproved write", () => {
  const text = formatCadAssistantPrompt({
    ...turn,
    selection: { source: "cad-creator", workspace: "model", project_id: "villa", revision: 4,
      object: { id: "wall-12", type: "wall", label: "North wall", units: "in" } },
  });
  assert.match(text, /North wall/);
  assert.match(text, /Revision: 4/);
  assert.match(text, /without explicit approval/);
  assert.throws(() => formatCadAssistantPrompt({ ...turn, prompt: "" }), /invalid_cad_assistant_request/);
});

test("CAD request uses existing side chat and delivers partial and final messages", async () => {
  const store = fakeStore({ existing: true });
  const updates: [string, boolean][] = [];
  const result = await runCadAssistantTurn(turn, (text, done) => updates.push([text, done]), store as any);
  assert.equal(result, "Generating section.");
  assert.deepEqual(updates, [
    ["Generating", false],
    ["Generating section.", false],
    ["Generating section.", true],
  ]);
  assert.equal(store.getState().sideTabs.length, 1);
  assert.equal(store.subscriptions.size, 0);
});

test("CAD request rejects busy, offline and failed model responses", async () => {
  const busy = fakeStore({ existing: true, busy: true });
  await assert.rejects(runCadAssistantTurn(turn, () => {}, busy as any), /cad_assistant_busy/);
  for (const [opts, error] of [
    [{ offline: true }, /cad_assistant_offline_queued/],
    [{ failed: true }, /cad_assistant_model_failed/],
  ] as const) {
    const store = fakeStore(opts);
    await assert.rejects(runCadAssistantTurn(turn, () => {}, store as any), error);
    assert.equal(store.subscriptions.size, 0);
  }
});
