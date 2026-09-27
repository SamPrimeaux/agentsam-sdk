import type { ReactNode } from "react";
import type { ContentAsset, ModelAssetExt } from "@inneranimalmedia/agentsam-content";
import { useContentRuntime } from "../context.js";
import { fmtBytes, styles, tokens } from "../theme.js";
import { KV, NumberField, Section } from "./shared.js";

export interface ModelViewportProps {
  asset: ContentAsset;
  camera: NonNullable<ModelAssetExt["camera"]>;
  placement: NonNullable<ModelAssetExt["placement"]>;
}

const DEFAULT_CAMERA = { theta: 0, phi: 1.2, radius: 5, fov: 45 };
const DEFAULT_PLACEMENT = {
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  scale: 1,
};

/**
 * Generic 3D asset inspector contract — harvested from the Fuel & Free
 * Time GLB editor. Camera (theta/phi/radius/FOV) and placement controls
 * are canonical; the actual Three.js viewport is host-injected via
 * renderViewport so the package carries no 3D engine dependency.
 */
export function ModelInspector(props: {
  asset: ContentAsset;
  renderViewport?: (vp: ModelViewportProps) => ReactNode;
}) {
  const runtime = useContentRuntime();
  const { asset } = props;
  const ext = (asset.ext ?? {}) as ModelAssetExt;
  const camera = { ...DEFAULT_CAMERA, ...ext.camera };
  const placement = { ...DEFAULT_PLACEMENT, ...ext.placement };

  const patchExt = (patch: Partial<ModelAssetExt>) =>
    void runtime.editAsset(asset.id, { ext: { ...asset.ext, ...patch } });

  const setCamera = (patch: Partial<typeof camera>) => patchExt({ camera: { ...camera, ...patch } });
  const setPlacement = (patch: Partial<typeof placement>) =>
    patchExt({ placement: { ...placement, ...patch } });
  const setPos = (i: 0 | 1 | 2, v: number) => {
    const position = [...placement.position] as [number, number, number];
    position[i] = v;
    setPlacement({ position });
  };
  const setRot = (i: 0 | 1 | 2, v: number) => {
    const rotation = [...placement.rotation] as [number, number, number];
    rotation[i] = v;
    setPlacement({ rotation });
  };

  return (
    <div>
      <Section title="Preview">
        <div style={{ ...styles.panel, aspectRatio: "4 / 3", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {props.renderViewport ? (
            props.renderViewport({ asset, camera, placement })
          ) : (
            <div style={{ textAlign: "center", color: tokens.textDim }}>
              <div style={{ fontSize: 42 }}>🧊</div>
              <div style={{ fontSize: 12 }}>Host viewport not injected (renderViewport)</div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Camera">
        <NumberField label="theta" value={camera.theta} onChange={(v) => setCamera({ theta: v })} />
        <NumberField label="phi" value={camera.phi} onChange={(v) => setCamera({ phi: v })} />
        <NumberField label="radius" value={camera.radius} onChange={(v) => setCamera({ radius: v })} />
        <NumberField label="FOV" value={camera.fov} step={1} onChange={(v) => setCamera({ fov: v })} />
      </Section>

      <Section title="Placement">
        <NumberField label="x" value={placement.position[0]} onChange={(v) => setPos(0, v)} />
        <NumberField label="y" value={placement.position[1]} onChange={(v) => setPos(1, v)} />
        <NumberField label="z" value={placement.position[2]} onChange={(v) => setPos(2, v)} />
        <NumberField label="rot x" value={placement.rotation[0]} onChange={(v) => setRot(0, v)} />
        <NumberField label="rot y" value={placement.rotation[1]} onChange={(v) => setRot(1, v)} />
        <NumberField label="rot z" value={placement.rotation[2]} onChange={(v) => setRot(2, v)} />
        <NumberField label="scale" value={placement.scale} onChange={(v) => setPlacement({ scale: v })} />
      </Section>

      <Section title="Model">
        <KV label="Format" value={ext.format ?? asset.mime} />
        <KV label="Bytes" value={fmtBytes(asset.bytes)} />
        <KV label="Triangles" value={ext.triangles?.toLocaleString()} />
        <KV label="Materials" value={ext.materials} />
        <KV label="Textures" value={ext.textures} />
        <KV label="Animations" value={ext.animations} />
        <KV
          label="Bounding box"
          value={
            ext.boundingBox
              ? `${ext.boundingBox.min.map((n) => n.toFixed(2)).join(", ")} → ${ext.boundingBox.max.map((n) => n.toFixed(2)).join(", ")}`
              : "—"
          }
        />
      </Section>

      <Section title="Delivery">
        <KV label="GLB" value={runtime.deliveryUrl(asset) ?? "—"} />
        <KV label="Poster" value={asset.variants.find((v) => v.name === "poster")?.url ?? "not generated"} />
        <KV label="Turntable" value={asset.variants.find((v) => v.name === "turntable")?.url ?? "not generated"} />
      </Section>
    </div>
  );
}
