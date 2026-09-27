import { describe, expect, it } from "vitest";
import {
  createContentRuntime,
  hasRuntimeCapability,
  hybridKnowledgeAdapter,
  noopBrandResolver,
  noopKnowledgeAdapter,
  unavailableLocalHost,
  type ContentBrandResolver,
  type ContentKnowledgeAdapter,
  type LocalContentHost,
} from "../src/index.js";
import { localFiles } from "../src/providers/local.js";

describe("normalize commit 1 contracts", () => {
  it("exposes runtime.capabilities() with account scope and allowAll flag", async () => {
    const rt = createContentRuntime({
      identity: { type: "human", ref: "tester" },
      account: { id: "acct_test" },
      providers: [localFiles()],
    });
    const caps = await rt.capabilities();
    expect(caps.accountId).toBe("acct_test");
    expect(caps.permissions.allowAll).toBe(true);
    expect(caps.local.availability).toBe("unavailable");
    expect(caps.brand.resolver).toBe(false);
    expect(caps.knowledge.index).toBe(false);
    expect(caps.providers.some((p) => p.id === "local" && p.legacy)).toBe(true);
  });

  it("accepts ContentActor + injected brand/knowledge/local host", async () => {
    const brands: ContentBrandResolver = {
      async get(id) {
        return id === "test-brand-a" ? { id, name: "Test Brand A" } : null;
      },
      async list() {
        return [{ id: "test-brand-a", name: "Test Brand A" }];
      },
      async match(asset) {
        if (asset.brandId) {
          return { brandId: asset.brandId, confidence: 1, evidence: ["explicit"] };
        }
        return null;
      },
    };

    const knowledge: ContentKnowledgeAdapter = {
      capabilities: () => ({
        index: true,
        remove: true,
        search: true,
        enrich: false,
        backends: ["fixture-vector"],
      }),
      async index(doc) {
        return { documentId: `doc_${doc.assetId}`, index: "fixture", indexedAt: new Date().toISOString() };
      },
      async remove() {},
      async search() {
        return [];
      },
    };

    const local: LocalContentHost = {
      async status() {
        return {
          availability: "attachable",
          machineId: "machine_fixture",
          watchSupported: true,
          processSupported: true,
        };
      },
      async list() {
        return [];
      },
      async stat() {
        throw new Error("not attached");
      },
      async openRead() {
        throw new Error("not attached");
      },
    };

    const rt = createContentRuntime({
      actor: {
        accountId: "acct_test",
        authUserId: "user_1",
        actorType: "human",
      },
      account: { id: "acct_test" },
      providers: [],
      brandResolver: brands,
      knowledge,
      localHost: local,
      storage: [
        {
          id: "r2-fixture",
          capabilities: ["storage.read", "storage.write", "delivery.url"],
          async put() {
            return { provider: "r2", ref: "k", role: "master" };
          },
          async get() {
            return null;
          },
          async head() {
            return null;
          },
          async delete() {},
        },
      ],
    });

    const caps = await rt.capabilities();
    expect(caps.brand.resolver).toBe(true);
    expect(caps.knowledge.backends).toEqual(["fixture-vector"]);
    expect(caps.local.availability).toBe("attachable");
    expect(hasRuntimeCapability(caps, "storage.write")).toBe(true);
    expect(hasRuntimeCapability(caps, "local.browse")).toBe(true);
    expect(hasRuntimeCapability(caps, "knowledge.search")).toBe(true);

    const asset = await rt.createAsset({
      origin: "upload",
      source: { type: "upload" },
      filename: "shot.png",
      brandId: "test-brand-a",
    });
    const indexed = await rt.indexForRag(asset.id);
    expect(indexed.intelligence?.rag?.documentId).toBe(`doc_${asset.id}`);

    const match = await rt.brandResolver.match({ id: asset.id, brandId: "test-brand-a" });
    expect(match?.brandId).toBe("test-brand-a");
  });

  it("rejects actor/account mismatch and provides noop hosts", async () => {
    expect(() =>
      createContentRuntime({
        actor: { accountId: "acct_a", actorType: "human" },
        account: { id: "acct_b" },
        providers: [],
      }),
    ).toThrow(/actor\.accountId/);

    expect(await unavailableLocalHost.status()).toEqual({
      availability: "unavailable",
      label: "No local runtime connected",
    });
    expect(noopBrandResolver).toBeTruthy();
    expect(noopKnowledgeAdapter.capabilities().index).toBe(false);
    expect(hybridKnowledgeAdapter([noopKnowledgeAdapter]).capabilities().search).toBe(false);
  });
});
