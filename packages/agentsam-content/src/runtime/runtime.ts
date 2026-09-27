import type { ActorRef } from "../core/actor.js";
import { SYSTEM_ACTOR } from "../core/actor.js";
import type { ContentAsset, ContentKind } from "../core/asset.js";
import type { ContentCollection, ContentQuery } from "../core/collection.js";
import { SYSTEM_COLLECTIONS } from "../core/collection.js";
import type { ContentEventBus, ContentEventType } from "../core/events.js";
import { eventForAsset } from "../core/events.js";
import { newAssetId, newRevisionId } from "../core/id.js";
import type { ContentOrigin, ContentState } from "../core/origin.js";
import { assertTransition } from "../core/origin.js";
import { appendProvenance } from "../core/provenance.js";
import { diffFields } from "../core/revision.js";
import type { ContentSource, ProviderRef } from "../core/source.js";
import { primaryRef } from "../core/source.js";
import type { ContentUsage, DeleteSafety } from "../core/usage.js";
import { evaluateDeleteSafety, usageKey } from "../core/usage.js";
import type { ContentVariant } from "../core/variant.js";
import { classifyKind } from "../intelligence/classify.js";
import type { RagSink, SemanticEnricher } from "../intelligence/index.js";
import { ragDocumentText, resolveKnowledgeAdapter } from "../intelligence/index.js";
import { applyMachineFacts, runMachinePass } from "../intelligence/machine-pass.js";
import { proposeSemanticAlias } from "../intelligence/semantic-name.js";
import type { AssistantHandler, ContentAssistantContext } from "./assistant.js";
import { buildAssistantContext } from "./assistant.js";
import type { ContentPermission, PermissionPolicy } from "./auth.js";
import { allowAll, PermissionDeniedError } from "./auth.js";
import { InMemoryEventBus } from "./event-bus.js";
import type { JobQueue } from "./jobs.js";
import { InMemoryJobQueue } from "./jobs.js";
import type { RouteMap } from "./routing.js";
import { defaultRoutes } from "./routing.js";
import type { ContentStore, ListPage } from "./store.js";
import { InMemoryContentStore } from "./store.js";
import type { ContentProvider, DeliveryOptions } from "../providers/types.js";
import { createProviderRegistry, ProviderRegistry } from "../providers/registry.js";
import type { ContentAccount, ContentActor } from "../contracts/account.js";
import { actorRefFromContentActor, assertAccountScoped } from "../contracts/account.js";
import type { ContentBrandResolver } from "../contracts/brand-resolver.js";
import { noopBrandResolver } from "../contracts/brand-resolver.js";
import type {
  AdapterRegistrySnapshot,
  CapabilityDescriptor,
  ContentDeliveryAdapter,
  ContentSourceAdapter,
  ContentStorageAdapter,
  ContentVideoDeliveryAdapter,
} from "../contracts/capabilities.js";
import type { ContentKnowledgeAdapter } from "../contracts/knowledge.js";
import type { LocalContentHost } from "../contracts/local-host.js";
import { unavailableLocalHost } from "../contracts/local-host.js";
import type { ContentRuntimeCapabilities } from "../contracts/runtime-capabilities.js";

/** Host-injected image optimize — web uses Nitro/sharp; desktop uses Tauri/agentsamd. Never import sharp in browser UI. */
export interface ImageOptimizeInput {
  bytes: Uint8Array;
  filename: string;
  mime?: string;
  format?: string;
}

export interface ImageOptimizeResult {
  /** Opaque local/provider ref for the derivative bytes. */
  ref: string;
  format: string;
  bytes: number;
  width?: number;
  height?: number;
  processor?: string;
  /** True when host skipped (non-image, etc.). */
  skipped?: boolean;
}

export type ImageOptimizer = (input: ImageOptimizeInput) => Promise<ImageOptimizeResult>;

export interface ImportAssetInput {
  file?: File;
  bytes?: Uint8Array;
  filename: string;
  mime?: string;
  brandId?: string;
  projectId?: string;
  /** Default true for images when an ImageOptimizer is configured. */
  optimize?: boolean | { format?: string };
  origin?: ContentOrigin;
}

export interface ContentRuntimeConfig {
  /**
   * Preferred: fully resolved host actor (account + auth user).
   * Legacy hosts may pass `identity` alone during migration.
   */
  actor?: ContentActor;
  /** Host-authenticated actor. Required unless `actor` is provided. */
  identity?: ActorRef;
  /** Account scope for every asset, event and knowledge document. */
  account: ContentAccount;
  /** Legacy monolithic providers — still registered; prefer capability adapters. */
  providers?: ContentProvider[];
  sources?: ContentSourceAdapter[];
  storage?: ContentStorageAdapter[];
  delivery?: ContentDeliveryAdapter[];
  video?: ContentVideoDeliveryAdapter[];
  brandResolver?: ContentBrandResolver;
  knowledge?: ContentKnowledgeAdapter;
  localHost?: LocalContentHost;
  /** Host-specific image optimize. Required for importAsset({ optimize: true }) on images. */
  imageOptimizer?: ImageOptimizer;
  store?: ContentStore;
  events?: ContentEventBus;
  jobs?: JobQueue;
  routes?: RouteMap;
  permissions?: PermissionPolicy;
  collections?: ContentCollection[];
  enricher?: SemanticEnricher;
  /** @deprecated Prefer `knowledge: ContentKnowledgeAdapter`. */
  rag?: RagSink;
  assistant?: AssistantHandler;
  theme?: Record<string, string>;
}

export interface CreateAssetInput {
  kind?: ContentKind;
  origin: ContentOrigin;
  state?: ContentState;
  source: ContentSource;
  providerRefs?: ProviderRef[];
  title?: string;
  filename?: string;
  mime?: string;
  bytes?: number;
  width?: number;
  height?: number;
  durationMs?: number;
  tags?: string[];
  brandId?: string;
  projectId?: string;
  role?: string;
  alt?: string;
  caption?: string;
  generation?: { model?: string; prompt?: string; promptHash?: string; jobId?: string; sourceAssetIds?: string[] };
  /** Raw bytes to run the deterministic machine pass on immediately. */
  rawBytes?: Uint8Array;
  ext?: Record<string, unknown>;
}

export type EditableFields = Partial<
  Pick<
    ContentAsset,
    | "title"
    | "alt"
    | "caption"
    | "role"
    | "semanticAlias"
    | "deliveryAlias"
    | "tags"
    | "resourceTags"
    | "brandId"
    | "projectId"
    | "ext"
  >
>;

function resolveIdentity(config: ContentRuntimeConfig): ActorRef {
  if (config.actor) return actorRefFromContentActor(config.actor);
  if (config.identity) return config.identity;
  throw new Error("createContentRuntime requires actor or identity");
}

export interface ContentRuntime {
  readonly accountId: string;
  readonly identity: ActorRef;
  readonly actor?: ContentActor;
  readonly providers: ProviderRegistry;
  readonly adapters: AdapterRegistrySnapshot;
  readonly brandResolver: ContentBrandResolver;
  readonly knowledge: ContentKnowledgeAdapter;
  readonly localHost: LocalContentHost;
  readonly events: ContentEventBus;
  readonly jobs: JobQueue;
  readonly routes: RouteMap;
  readonly store: ContentStore;
  readonly collections: ContentCollection[];
  readonly theme: Record<string, string>;

  can(permission: ContentPermission): boolean;
  /** UI/agents must derive tabs and actions from this — never hardcode providers. */
  capabilities(): Promise<ContentRuntimeCapabilities>;

  createAsset(input: CreateAssetInput, actor?: ActorRef): Promise<ContentAsset>;
  /**
   * Create asset from bytes/File and optionally run host image optimize + public variant.
   * Orchestration lives here so UI hosts (Local Studio, web, FnF) do not duplicate pipelines.
   */
  importAsset(input: ImportAssetInput, actor?: ActorRef): Promise<ContentAsset>;
  /** Run host optimize for an existing asset (images). Emits processing events via variants. */
  optimizeAsset(
    id: string,
    opts?: { format?: string; bytes?: Uint8Array; filename?: string; mime?: string },
    actor?: ActorRef,
  ): Promise<ContentAsset>;
  getAsset(id: string): Promise<ContentAsset | null>;
  listAssets(query?: ContentQuery): Promise<ListPage>;
  listView(collectionId: string, extra?: Partial<ContentQuery>): Promise<ListPage>;

  editAsset(id: string, fields: EditableFields, actor?: ActorRef): Promise<ContentAsset>;
  transition(id: string, to: ContentState, actor?: ActorRef): Promise<ContentAsset>;
  rate(id: string, rating: -1 | 0 | 1, actor?: ActorRef): Promise<ContentAsset>;
  addVariant(id: string, variant: ContentVariant, actor?: ActorRef): Promise<ContentAsset>;
  addProviderRef(id: string, ref: ProviderRef, actor?: ActorRef): Promise<ContentAsset>;

  attachUsage(id: string, usage: ContentUsage, actor?: ActorRef): Promise<ContentAsset>;
  detachUsage(id: string, app: string, surface: string, actor?: ActorRef): Promise<ContentAsset>;
  deleteSafety(id: string): Promise<DeleteSafety>;
  deleteAsset(id: string, opts?: { force?: boolean }, actor?: ActorRef): Promise<void>;

  applySemanticAlias(id: string, alias?: string, actor?: ActorRef): Promise<ContentAsset>;
  enrich(id: string): Promise<ContentAsset>;
  indexForRag(id: string): Promise<ContentAsset>;

  deliveryUrl(asset: ContentAsset, opts?: DeliveryOptions): string | null;
  posterUrl(asset: ContentAsset, width?: number): string | null;

  assistantContext(
    id: string,
    opts?: { currentInspector?: string; currentError?: string; extra?: Record<string, unknown> },
  ): Promise<ContentAssistantContext>;
  runAssistant(id: string, action: string, opts?: { currentInspector?: string }): Promise<unknown>;
}

export function createContentRuntime(config: ContentRuntimeConfig): ContentRuntime {
  const store = config.store ?? new InMemoryContentStore();
  const events = config.events ?? new InMemoryEventBus();
  const jobs = config.jobs ?? new InMemoryJobQueue();
  const routes = config.routes ?? defaultRoutes();
  const permissions = config.permissions ?? allowAll;
  const registry = createProviderRegistry(config.providers ?? []);
  const collections = [...SYSTEM_COLLECTIONS, ...(config.collections ?? [])];
  const accountId = config.account.id;
  if (!accountId) throw new Error("createContentRuntime requires account.id");
  if (config.actor && config.actor.accountId !== accountId) {
    throw new Error("actor.accountId must match account.id");
  }

  const identity = resolveIdentity(config);
  const brandResolver = config.brandResolver ?? noopBrandResolver;
  const knowledge = resolveKnowledgeAdapter({ knowledge: config.knowledge, rag: config.rag });
  const localHost = config.localHost ?? unavailableLocalHost;
  const adapters: AdapterRegistrySnapshot = {
    sources: config.sources ?? [],
    storage: config.storage ?? [],
    delivery: config.delivery ?? [],
    video: config.video ?? [],
  };

  const now = () => new Date().toISOString();

  const require = (permission: ContentPermission, actor: ActorRef) => {
    if (!permissions.can(actor, permission)) throw new PermissionDeniedError(permission);
  };

  const emit = (
    type: ContentEventType,
    asset: ContentAsset,
    actor: ActorRef,
    data: Record<string, unknown> = {},
  ) => events.emit(eventForAsset(type, asset, actor, data));

  const save = async (asset: ContentAsset): Promise<ContentAsset> => {
    assertAccountScoped(accountId, asset.accountId);
    const next = { ...asset, updatedAt: now() };
    await store.put(next);
    return next;
  };

  const mustGet = async (id: string): Promise<ContentAsset> => {
    const asset = await store.get(id);
    if (!asset) throw new Error(`Unknown asset: ${id}`);
    assertAccountScoped(accountId, asset.accountId);
    return asset;
  };

  const runtime: ContentRuntime = {
    accountId,
    identity,
    actor: config.actor,
    providers: registry,
    adapters,
    brandResolver,
    knowledge,
    localHost,
    events,
    jobs,
    routes,
    store,
    collections,
    theme: config.theme ?? {},

    can(permission) {
      return permissions.can(identity, permission);
    },

    async capabilities() {
      const localStatus = await localHost.status();
      const capabilityList: CapabilityDescriptor[] = [];

      for (const p of registry.all()) {
        for (const cap of p.capabilities) {
          capabilityList.push({
            id: `legacy.${String(p.name)}.${cap}` as CapabilityDescriptor["id"],
            provider: String(p.name),
            label: `${p.name}:${cap}`,
            status: "available",
          });
        }
      }
      for (const group of [adapters.sources, adapters.storage, adapters.delivery, adapters.video]) {
        for (const adapter of group) {
          for (const id of adapter.capabilities) {
            capabilityList.push({ id, provider: adapter.id, status: "available" });
          }
        }
      }
      if (localStatus.availability !== "unavailable") {
        capabilityList.push({
          id: "local.browse",
          provider: "local-host",
          status: localStatus.availability,
        });
        if (localStatus.watchSupported) {
          capabilityList.push({
            id: "local.watch",
            provider: "local-host",
            status: localStatus.availability,
          });
        }
        if (localStatus.processSupported) {
          capabilityList.push({
            id: "local.process",
            provider: "local-host",
            status: localStatus.availability,
          });
        }
      }
      const kc = knowledge.capabilities();
      if (kc.index) {
        capabilityList.push({ id: "knowledge.index", provider: "knowledge", status: "available" });
      }
      if (kc.search) {
        capabilityList.push({ id: "knowledge.search", provider: "knowledge", status: "available" });
      }

      return {
        accountId,
        providers: [
          ...registry.all().map((p) => ({
            id: String(p.name),
            capabilities: p.capabilities.map(
              (c) => `legacy.${c}` as CapabilityDescriptor["id"],
            ),
            kinds: p.kinds,
            legacy: true,
          })),
          ...adapters.sources.map((s) => ({ id: s.id, capabilities: s.capabilities })),
          ...adapters.storage.map((s) => ({ id: s.id, capabilities: s.capabilities })),
          ...adapters.delivery.map((d) => ({ id: d.id, capabilities: d.capabilities })),
          ...adapters.video.map((v) => ({ id: v.id, capabilities: v.capabilities })),
        ],
        capabilities: capabilityList,
        brand: {
          resolver: Boolean(config.brandResolver) && config.brandResolver !== noopBrandResolver,
        },
        knowledge: kc,
        local: {
          availability: localStatus.availability,
          watchSupported: Boolean(localStatus.watchSupported),
          processSupported: Boolean(localStatus.processSupported),
        },
        permissions: { allowAll: permissions === allowAll },
      };
    },

    async createAsset(input, actor = identity) {
      require(input.origin === "generated" ? "content.generate" : "content.upload", actor);
      const kind =
        input.kind ?? classifyKind({ mime: input.mime, filename: input.filename }) ?? "document";
      const created = now();
      let asset: ContentAsset = {
        id: newAssetId(),
        accountId,
        brandId: input.brandId,
        projectId: input.projectId,
        kind,
        origin: input.origin,
        state: input.state ?? (input.origin === "generated" ? "draft" : "review"),
        source: input.source,
        providerRefs: input.providerRefs ?? [],
        title: input.title,
        filename: input.filename,
        mime: input.mime,
        bytes: input.bytes,
        width: input.width,
        height: input.height,
        durationMs: input.durationMs,
        tags: input.tags ?? [],
        role: input.role,
        alt: input.alt,
        caption: input.caption,
        variants: [],
        usage: [],
        provenance: {
          generation: input.generation,
          import:
            input.origin === "cms-import" || input.origin === "site-crawl"
              ? { batch: input.source.batch, sourceUrl: input.source.ref }
              : undefined,
          history: [
            {
              at: created,
              action:
                input.origin === "generated"
                  ? "generated"
                  : input.origin === "upload"
                    ? "uploaded"
                    : "imported",
              actor,
            },
          ],
        },
        createdBy: actor,
        createdAt: created,
        updatedAt: created,
        ext: input.ext,
      };

      if (input.rawBytes) {
        const facts = runMachinePass(input.rawBytes, { existing: await store.all() });
        asset = applyMachineFacts(asset, facts);
        if (!input.kind && facts.mimeSniffed) {
          asset.kind = classifyKind({ mime: facts.mimeSniffed }) ?? asset.kind;
        }
      }

      await store.put(asset);
      emit(
        input.origin === "generated"
          ? "content.asset.generated"
          : input.origin === "upload"
            ? "content.asset.created"
            : "content.asset.imported",
        asset,
        actor,
        { origin: input.origin, kind: asset.kind },
      );
      if (asset.intelligence?.machine?.duplicateOf) {
        emit("content.asset.discovered", asset, SYSTEM_ACTOR, {
          duplicateOf: asset.intelligence.machine.duplicateOf,
        });
      }
      return asset;
    },

    async importAsset(input, actor = identity) {
      let rawBytes = input.bytes;
      let filename = input.filename;
      let mime = input.mime;
      let byteLen = rawBytes?.byteLength;
      if (input.file) {
        rawBytes = rawBytes ?? new Uint8Array(await input.file.arrayBuffer());
        filename = filename || input.file.name;
        mime = mime || input.file.type || undefined;
        byteLen = rawBytes.byteLength;
      }
      if (!rawBytes || !filename) {
        throw new Error("importAsset_requires_file_or_bytes");
      }

      const asset = await runtime.createAsset(
        {
          origin: input.origin ?? "upload",
          source: { type: "upload", importedAt: now() },
          filename,
          mime,
          bytes: byteLen,
          brandId: input.brandId,
          projectId: input.projectId,
          rawBytes,
        },
        actor,
      );

      const wantOptimize =
        input.optimize === false
          ? false
          : Boolean(config.imageOptimizer) &&
            Boolean(mime?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(filename));
      if (!wantOptimize) return asset;

      const format =
        typeof input.optimize === "object" && input.optimize?.format
          ? input.optimize.format
          : undefined;
      try {
        return await runtime.optimizeAsset(
          asset.id,
          { format, bytes: rawBytes, filename, mime },
          actor,
        );
      } catch (err) {
        emit("content.asset.edited", asset, actor, {
          optimizeFailed: true,
          error: err instanceof Error ? err.message : String(err),
        });
        return asset;
      }
    },

    async optimizeAsset(id, opts = {}, actor = identity) {
      require("content.edit", actor);
      const asset = await mustGet(id);
      if (!config.imageOptimizer) {
        throw new Error("image_optimizer_not_configured");
      }
      const mime = opts.mime ?? asset.mime;
      if (mime && !mime.startsWith("image/")) {
        return asset;
      }
      let bytes = opts.bytes;
      if (!bytes) {
        throw new Error("optimizeAsset_requires_bytes");
      }
      const filename = opts.filename ?? asset.filename ?? `${asset.id}.bin`;
      const result = await config.imageOptimizer({
        bytes,
        filename,
        mime,
        format: opts.format,
      });
      if (result.skipped) return asset;
      return runtime.addVariant(
        id,
        {
          name: "public",
          providerRef: { provider: "local", ref: result.ref, role: "derivative" },
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          approved: true,
          createdAt: now(),
        },
        actor,
      );
    },

    getAsset: async (id) => {
      const asset = await store.get(id);
      if (!asset) return null;
      assertAccountScoped(accountId, asset.accountId);
      return asset;
    },

    listAssets: (query) => store.list(query),

    async listView(collectionId, extra = {}) {
      const collection = collections.find((c) => c.id === collectionId);
      if (!collection) throw new Error(`Unknown collection: ${collectionId}`);
      return store.list({ ...collection.query, ...extra });
    },

    async editAsset(id, fields, actor = identity) {
      require("content.edit", actor);
      const before = await mustGet(id);
      const changes = diffFields(before as unknown as Record<string, unknown>, fields);
      if (Object.keys(changes).length === 0) return before;
      let next: ContentAsset = { ...before, ...fields };
      next = { ...next, provenance: appendProvenance(next.provenance, { action: "edited", actor, detail: { fields: Object.keys(changes) } }) };
      next = await save(next);
      await store.addRevision({ id: newRevisionId(), assetId: id, at: now(), actor, changes });
      emit("content.asset.edited", next, actor, { changes });
      if ("tags" in changes) emit("content.asset.tagged", next, actor, { tags: next.tags });
      return next;
    },

    async transition(id, to, actor = identity) {
      require(to === "live" || to === "approved" ? "content.publish" : "content.review", actor);
      const before = await mustGet(id);
      assertTransition(before.state, to);
      let next: ContentAsset = {
        ...before,
        state: to,
        provenance: appendProvenance(before.provenance, {
          action: "state-changed",
          actor,
          detail: { from: before.state, to },
        }),
      };
      next = await save(next);
      emit("content.asset.state-changed", next, actor, { from: before.state, to });
      if (to === "live") emit("content.asset.published", next, actor, {});
      if (to === "superseded") emit("content.asset.superseded", next, actor, {});
      return next;
    },

    async rate(id, rating, actor = identity) {
      require("content.review", actor);
      const before = await mustGet(id);
      let next: ContentAsset = {
        ...before,
        rating,
        provenance: appendProvenance(before.provenance, { action: "rated", actor, detail: { rating } }),
      };
      next = await save(next);
      emit("content.asset.rated", next, actor, { rating });
      return next;
    },

    async addVariant(id, variant, actor = identity) {
      require("content.edit", actor);
      const before = await mustGet(id);
      const variants = [...before.variants.filter((v) => v.name !== variant.name), { ...variant, createdAt: variant.createdAt ?? now() }];
      const next = await save({ ...before, variants });
      emit("content.asset.variant-added", next, actor, { name: variant.name, format: variant.format, bytes: variant.bytes });
      if (variant.approved) emit("content.asset.optimized", next, actor, { variant: variant.name });
      return next;
    },

    async addProviderRef(id, ref, actor = identity) {
      require("content.edit", actor);
      const before = await mustGet(id);
      const providerRefs = [...before.providerRefs.filter((r) => !(r.provider === ref.provider && r.ref === ref.ref)), ref];
      return save({ ...before, providerRefs });
    },

    async attachUsage(id, usage, actor = identity) {
      require("content.edit", actor);
      const before = await mustGet(id);
      const key = usageKey(usage);
      const filtered = before.usage.filter((u) => usageKey(u) !== key);
      const next = await save({
        ...before,
        usage: [...filtered, { attachedAt: now(), ...usage }],
      });
      emit("content.asset.used", next, actor, { app: usage.app, surface: usage.surface, live: usage.live });
      return next;
    },

    async detachUsage(id, app, surface, actor = identity) {
      require("content.edit", actor);
      const before = await mustGet(id);
      const key = usageKey({ app, surface });
      const next = await save({
        ...before,
        usage: before.usage.map((u) =>
          usageKey(u) === key ? { ...u, live: false, detachedAt: now() } : u,
        ),
      });
      emit("content.asset.unused", next, actor, { app, surface });
      return next;
    },

    async deleteSafety(id) {
      const asset = await mustGet(id);
      return evaluateDeleteSafety(asset.usage);
    },

    async deleteAsset(id, opts = {}, actor = identity) {
      require("content.delete", actor);
      const asset = await mustGet(id);
      const safety = evaluateDeleteSafety(asset.usage);
      if (!safety.safe && !opts.force) {
        throw new Error(`Refusing to delete ${id}: ${safety.reason}`);
      }
      await store.delete(id);
      emit("content.asset.deleted", asset, actor, { forced: !!opts.force });
    },

    async applySemanticAlias(id, alias, actor = identity) {
      require("content.edit", actor);
      const asset = await mustGet(id);
      const semanticAlias = alias ?? proposeSemanticAlias(asset);
      return runtime.editAsset(
        id,
        { semanticAlias, deliveryAlias: asset.deliveryAlias ?? semanticAlias },
        actor,
      );
    },

    async enrich(id) {
      if (!config.enricher) throw new Error("No semantic enricher configured");
      const asset = await mustGet(id);
      const semantic = await config.enricher.enrich(asset);
      const next = await save({
        ...asset,
        intelligence: { ...asset.intelligence, semantic: { ...semantic, enrichedAt: now() } },
      });
      return next;
    },

    async indexForRag(id) {
      const kc = knowledge.capabilities();
      if (!kc.index) throw new Error("No knowledge adapter with index capability configured");
      const asset = await mustGet(id);
      const receipt = await knowledge.index({
        assetId: id,
        accountId,
        brandId: asset.brandId,
        kind: asset.kind,
        semanticName: asset.semanticAlias,
        altText: asset.alt,
        tags: asset.tags,
        machineFacts: asset.intelligence?.machine as Record<string, unknown> | undefined,
        text: ragDocumentText(asset),
        metadata: {
          kind: asset.kind,
          state: asset.state,
          origin: asset.origin,
          brandId: asset.brandId,
          tags: asset.tags,
        },
      });
      return save({
        ...asset,
        intelligence: {
          ...asset.intelligence,
          rag: { indexedAt: receipt.indexedAt, documentId: receipt.documentId, index: receipt.index },
        },
      });
    },

    deliveryUrl(asset, opts) {
      // Prefer an approved variant URL at/above the requested width.
      if (opts?.width) {
        const candidates = asset.variants
          .filter((v) => v.url && typeof v.width === "number" && (v.width as number) >= opts.width!)
          .sort((a, b) => (a.width as number) - (b.width as number));
        if (candidates[0]?.url) return candidates[0].url;
      }
      const ref = primaryRef(asset.providerRefs);
      if (!ref) return null;
      if (ref.url && !opts) return ref.url;
      if (!registry.has(ref.provider)) return ref.url ?? null;
      return registry.get(ref.provider).deliveryUrl(ref.ref, opts) ?? ref.url ?? null;
    },

    posterUrl(asset, width) {
      const poster = asset.variants.find((v) => v.name === "poster" && v.url);
      if (poster?.url) return poster.url;
      const ext = asset.ext as { posterUrl?: string } | undefined;
      if (ext?.posterUrl) return ext.posterUrl;
      const streamRef = asset.providerRefs.find((r) => r.provider === "cloudflare-stream");
      if (streamRef && registry.has("cloudflare-stream")) {
        return registry.get("cloudflare-stream").deliveryUrl(streamRef.ref, { format: "poster", width });
      }
      if (asset.kind === "image") return runtime.deliveryUrl(asset, { width: width ?? 400 });
      return null;
    },

    async assistantContext(id, opts = {}) {
      const asset = await mustGet(id);
      return buildAssistantContext(asset, {
        providerNames: registry.names().map(String),
        currentInspector: opts.currentInspector,
        currentError: opts.currentError,
        extra: opts.extra,
      });
    },

    async runAssistant(id, action, opts = {}) {
      if (!config.assistant) throw new Error("No assistant handler configured");
      const context = await runtime.assistantContext(id, opts);
      return config.assistant.run(action as never, context);
    },
  };

  return runtime;
}
