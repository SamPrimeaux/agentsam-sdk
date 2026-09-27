import {
  createContentRuntime,
  localFiles,
  proposeAlt,
  proposeTags,
  proposeSemanticAlias,
  findDuplicateGroups,
  matchBrand,
  ragDocumentText,
  type ContentRuntime,
  type AssistantHandler,
} from "@inneranimalmedia/agentsam-content";

/** Tiny inline SVG "photos" so the demo needs zero network. */
function svgDataUri(label: string, from: string, to: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="640" height="480" fill="url(#g)"/>
    <text x="50%" y="46%" font-size="110" text-anchor="middle">${emoji}</text>
    <text x="50%" y="72%" font-size="30" fill="#ffffffcc" text-anchor="middle" font-family="system-ui">${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const BRAND_PACKS = [
  { brandId: "fuel-free-time", name: "Fuel & Free Time", keywords: ["garage", "car", "fuel", "emblem"] },
  { brandId: "inneranimalmedia", name: "InnerAnimalMedia", keywords: ["animal", "studio", "media"] },
];

/** Deterministic demo assistant: machine facts first, no LLM required. */
const demoAssistant: AssistantHandler = {
  async run(action, ctx) {
    const a = ctx.asset;
    switch (action) {
      case "describe": {
        const m = a.intelligence?.machine;
        return [
          `${a.kind} · ${a.state} · origin ${a.origin}`,
          m?.width ? `dimensions ${m.width}×${m.height}` : null,
          a.bytes ? `${Math.round(a.bytes / 1024)} KB` : null,
          `providers: ${a.providerRefs.map((r) => r.provider).join(", ") || "none"}`,
          a.usage.length ? `used by ${a.usage.map((u) => `${u.app}/${u.surface}`).join(", ")}` : "not referenced",
        ]
          .filter(Boolean)
          .join("\n");
      }
      case "write-alt":
        return proposeAlt(a) ?? "Add a subject/description first — nothing to compose alt text from.";
      case "rename-semantic":
        return `Proposed alias: ${proposeSemanticAlias(a)}\n(original filename ${a.filename ?? "—"} is preserved)`;
      case "tag":
        return `Proposed tags: ${proposeTags(a).join(", ") || "none — already well tagged"}`;
      case "identify-brand": {
        const match = matchBrand(a, BRAND_PACKS);
        return match
          ? `${match.brandId} (confidence ${(match.confidence * 100).toFixed(0)}%, matched on: ${match.matchedOn.join(", ")})`
          : "No brand match from current metadata.";
      }
      case "where-used":
        return ctx.deleteSafety.totalReferences === 0
          ? "Not referenced by any surface."
          : a.usage.map((u) => `${u.live && !u.detachedAt ? "●" : "○"} ${u.app} / ${u.surface}`).join("\n");
      case "delete-safety":
        return ctx.deleteSafety.reason;
      case "find-duplicates": {
        const all = await ctxRuntime!.store.all();
        const groups = findDuplicateGroups(all).filter((g) => g.assetIds.includes(a.id));
        return groups.length ? `Byte-identical assets: ${groups[0]!.assetIds.filter((id) => id !== a.id).join(", ")}` : "No exact duplicates.";
      }
      case "optimize":
      case "lighter-web-version":
        return "Queued durable job: optimize → AVIF/WebP derivatives (Cloudflare Queue in production).";
      case "create-poster":
        return "Queued durable job: extract poster frame via Stream.";
      default:
        return `RAG context that AgentSam would receive:\n\n${ragDocumentText(a)}`;
    }
  },
};

let ctxRuntime: ContentRuntime | null = null;

export async function buildDemoRuntime(): Promise<ContentRuntime> {
  const local = localFiles();

  // ── This is the whole host adapter. Fuel & Free Time or IAM would
  //    differ only in providers/routes/permissions, never in UI code.
  const runtime = createContentRuntime({
    identity: { type: "human", ref: "demo-user" },
    account: { id: "acct_local_studio", label: "Local Studio" },
    providers: [local],
    assistant: demoAssistant,
  });
  ctxRuntime = runtime;

  const img = (name: string, label: string, from: string, to: string, emoji: string) => {
    const url = svgDataUri(label, from, to, emoji);
    const ref = local.put({ name, mime: "image/svg+xml", url });
    return { ref, url };
  };

  // 1. Live brand hero, optimized, in use on two surfaces
  const hero = img("fft-hero.svg", "Garage hero", "#1c2b4a", "#5b8cff", "🏁");
  const heroAsset = await runtime.createAsset({
    origin: "upload",
    source: { type: "upload" },
    kind: "image",
    filename: "IMG_5933.PNG",
    title: "Garage workbench hero",
    brandId: "fuel-free-time",
    role: "hero",
    mime: "image/png",
    bytes: 4_800_000,
    width: 2400,
    height: 1350,
    tags: ["garage", "hero"],
    alt: "Sunlit garage workbench with tools and a vintage car",
    providerRefs: [{ ...hero.ref, url: hero.url }],
  });
  await runtime.applySemanticAlias(heroAsset.id);
  await runtime.addVariant(heroAsset.id, {
    name: "public",
    format: "avif",
    bytes: 140_000,
    width: 1280,
    approved: true,
    url: hero.url,
  });
  await runtime.addVariant(heroAsset.id, { name: "poster", url: hero.url, width: 640 });
  await runtime.transition(heroAsset.id, "review");
  await runtime.transition(heroAsset.id, "approved");
  await runtime.transition(heroAsset.id, "live");
  await runtime.attachUsage(heroAsset.id, { app: "fuel-free-time", surface: "home.hero", live: true, kind: "page" });
  await runtime.attachUsage(heroAsset.id, { app: "inneranimalmedia", surface: "case-study.fuel-free-time", live: true, kind: "page" });

  // 2. Generated draft logo with full generation provenance, rated down
  const logo = img("hourglass-logo.svg", "Hourglass mark", "#2a2118", "#f5b83d", "⏳");
  const logoAsset = await runtime.createAsset({
    origin: "generated",
    source: { type: "generation", ref: "job_gen_014" },
    kind: "image",
    title: "Black hourglass logo concept",
    brandId: "fuel-free-time",
    role: "logo",
    mime: "image/png",
    bytes: 890_000,
    width: 1024,
    height: 1024,
    tags: ["logo", "concept"],
    generation: {
      model: "workers-ai/flux-schnell",
      prompt: "minimal black hourglass mark, garage & car motif, flat vector",
      promptHash: "ph_8c1a2f",
      jobId: "job_gen_014",
    },
    providerRefs: [{ ...logo.ref, url: logo.url }],
  });
  await runtime.addVariant(logoAsset.id, { name: "poster", url: logo.url, width: 640 });
  await runtime.rate(logoAsset.id, -1);

  // 3. CMS import awaiting review — provenance, not a dumping ground
  const imp = img("legacy-banner.svg", "Legacy banner", "#3d1f2a", "#f0565f", "🗂");
  const impAsset = await runtime.createAsset({
    origin: "cms-import",
    source: { type: "site-crawl", ref: "https://old-customer-site.com", batch: "import_0137" },
    kind: "image",
    filename: "1B88C55D-AEAC-47F2-banner.jpg",
    mime: "image/jpeg",
    bytes: 2_300_000,
    width: 1920,
    height: 600,
    providerRefs: [{ ...imp.ref, url: imp.url }],
  });
  await runtime.addVariant(impAsset.id, { name: "poster", url: imp.url, width: 640 });

  // 4. Video with Stream-style detail + R2 master
  const vid = img("launch-teaser-poster.svg", "Launch teaser", "#10281c", "#3ecf8e", "🎬");
  const vidAsset = await runtime.createAsset({
    origin: "upload",
    source: { type: "upload" },
    kind: "video",
    title: "About page launch teaser",
    brandId: "fuel-free-time",
    filename: "teaser-final-v3.mp4",
    mime: "video/mp4",
    bytes: 48_000_000,
    width: 1920,
    height: 1080,
    durationMs: 42_000,
    tags: ["teaser", "about"],
    providerRefs: [
      { provider: "cloudflare-stream", ref: "stream_uid_demo01", role: "delivery" },
      { provider: "r2", ref: "brands/fuel-free-time/masters/teaser-final-v3.mp4", role: "master", bytes: 48_000_000 },
    ],
    ext: {
      streamStatus: "ready",
      resolution: "1920×1080",
      posterUrl: vid.url,
      captions: [{ language: "en", label: "English (auto)" }],
      downloadsEnabled: true,
      requireSignedURLs: false,
    },
  });
  await runtime.addVariant(vidAsset.id, { name: "poster", url: vid.url, width: 640 });
  await runtime.transition(vidAsset.id, "approved");
  await runtime.transition(vidAsset.id, "live");
  await runtime.attachUsage(vidAsset.id, { app: "fuel-free-time", surface: "about.story", live: true, kind: "page" });

  // 5. GLB emblem — the Fuel & Free Time 3D inspector donor
  const glbPoster = img("emblem-3d-poster.svg", "FFT emblem GLB", "#241a33", "#9b6cff", "🧊");
  const glbAsset = await runtime.createAsset({
    origin: "product",
    source: { type: "upload" },
    kind: "model",
    title: "FFT emblem 3D",
    brandId: "fuel-free-time",
    filename: "emblem.glb",
    mime: "model/gltf-binary",
    bytes: 3_200_000,
    tags: ["emblem", "product"],
    providerRefs: [
      { provider: "r2", ref: "brands/fuel-free-time/masters/emblem.glb", role: "master" },
      { ...glbPoster.ref, url: glbPoster.url },
    ],
    ext: {
      format: "glb",
      triangles: 48_212,
      materials: 4,
      textures: 6,
      animations: 1,
      boundingBox: { min: [-0.6, 0, -0.6], max: [0.6, 1.4, 0.6] },
      camera: { theta: 0.6, phi: 1.15, radius: 3.2, fov: 40 },
      placement: { position: [0, 0.2, 0], rotation: [0, 0.4, 0], scale: 1 },
    },
  });
  await runtime.addVariant(glbAsset.id, { name: "poster", url: glbPoster.url, width: 640 });
  await runtime.transition(glbAsset.id, "approved");
  await runtime.transition(glbAsset.id, "live");
  await runtime.attachUsage(glbAsset.id, { app: "fuel-free-time", surface: "product.fft-emblem", live: true, kind: "product" });

  // 6. Unused, untagged upload — recommendation fodder
  const stray = img("untitled-stray.svg", "Untitled upload", "#222", "#555", "❔");
  await runtime.createAsset({
    origin: "upload",
    source: { type: "upload" },
    kind: "image",
    filename: "Screenshot 2025-11-02 at 09.12.44.png",
    mime: "image/png",
    bytes: 1_900_000,
    width: 2880,
    height: 1800,
    providerRefs: [{ ...stray.ref, url: stray.url }],
  }).then(async (a) => {
    await runtime.addVariant(a.id, { name: "poster", url: stray.url, width: 640 });
  });

  return runtime;
}
