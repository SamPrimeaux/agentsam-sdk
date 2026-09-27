// @vitest-environment node
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createContentRuntime,
  localFiles,
  type ContentAsset,
} from "@inneranimalmedia/agentsam-content";
import { ContentRuntimeProvider } from "../src/context.js";
import { AssetDetail } from "../src/AssetDetail.js";
import { ContentStudio } from "../src/ContentStudio.js";
import { ImageInspector } from "../src/inspectors/ImageInspector.js";
import { ModelInspector } from "../src/inspectors/ModelInspector.js";
import { UsageInspector } from "../src/inspectors/UsageInspector.js";

function makeRuntime() {
  return createContentRuntime({
    identity: { type: "human", ref: "tester" },
    account: { id: "acct_ui" },
    providers: [localFiles()],
  });
}

function makeAsset(partial: Partial<ContentAsset> = {}): ContentAsset {
  return {
    id: "ast_ui1",
    accountId: "acct_ui",
    kind: "image",
    origin: "upload",
    state: "review",
    source: { type: "upload" },
    providerRefs: [{ provider: "local", ref: "loc_1", role: "original" }],
    filename: "IMG_5933.PNG",
    semanticAlias: "fft-emblem-garage",
    bytes: 480_000,
    width: 1600,
    height: 900,
    tags: ["logo", "garage"],
    variants: [{ name: "public", format: "avif", bytes: 140_000, width: 1280, approved: true }],
    usage: [{ app: "fuel-free-time", surface: "home.hero", live: true }],
    provenance: { history: [{ at: new Date().toISOString(), action: "uploaded" }] },
    createdBy: { type: "human", ref: "tester" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

function withRuntime(node: React.ReactNode) {
  return renderToStaticMarkup(
    <ContentRuntimeProvider runtime={makeRuntime()}>{node}</ContentRuntimeProvider>,
  );
}

describe("content studio UI", () => {
  it("renders the studio shell with system views", () => {
    const html = renderToStaticMarkup(<ContentStudio runtime={makeRuntime()} />);
    expect(html).toContain("All");
    expect(html).toContain("Generated");
    expect(html).toContain("Needs review");
    expect(html).toContain("AgentSam");
  });

  it("renders image inspector sections", () => {
    const html = withRuntime(<ImageInspector asset={makeAsset()} />);
    for (const section of ["Source", "Delivery", "Semantics", "SEO", "Variants"]) {
      expect(html).toContain(section);
    }
    expect(html).toContain("1600 × 900");
    expect(html).toContain("avif");
  });

  it("renders model inspector with camera/placement controls", () => {
    const model = makeAsset({
      kind: "model",
      mime: "model/gltf-binary",
      ext: {
        format: "glb",
        camera: { theta: 0.5, phi: 1.1, radius: 4, fov: 50 },
        placement: { position: [0, 1, 0], rotation: [0, 0, 0], scale: 1.5 },
        materials: 3,
      },
    });
    const html = withRuntime(<ModelInspector asset={model} />);
    for (const label of ["theta", "phi", "radius", "FOV", "scale", "Bounding box"]) {
      expect(html).toContain(label);
    }
  });

  it("renders usage graph", () => {
    const html = withRuntime(<UsageInspector asset={makeAsset()} />);
    expect(html).toContain("fuel-free-time");
    expect(html).toContain("home.hero");
  });

  it("asset detail offers only legal transitions", () => {
    const html = withRuntime(<AssetDetail asset={makeAsset({ state: "review" })} />);
    expect(html).toContain("→ approved");
    expect(html).toContain("→ rejected");
    expect(html).not.toContain("→ live"); // review cannot jump straight to live
  });
});
