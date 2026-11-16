import * as THREE from 'three';
import * as xb from 'xrblocks';
import type { DroppedImageAsset, SceneryPropType } from '../types.ts';
import { STAGE_POSITION } from './environment.ts';
import type { StudioMaterialLibrary } from './materials.ts';
import type { StudioTextureSet } from './textures.ts';

export interface PlacedPropItem {
  id: string;
  kind: SceneryPropType | 'image';
  label: string;
  group: THREE.Group;
  dispose: () => void;
}

const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

/**
 * Web-friendly 3D Scenery Maker & Dropped-Image Backdrop Manager.
 * Supports click-to-place on the studio floor, click-to-select, drag-to-move,
 * rotate, and remove for users without XR hardware.
 */
export class SceneryManager extends xb.Script {
  private materials: StudioMaterialLibrary;
  private textures: StudioTextureSet;
  private propsRoot = new THREE.Group();
  private items: PlacedPropItem[] = [];
  private selectedId: string | null = null;
  private armedPlacement:
    | { kind: 'prop'; propType: SceneryPropType }
    | { kind: 'image'; asset: DroppedImageAsset }
    | null = null;

  private selectionRing!: THREE.Mesh;
  private selectionGeo!: THREE.RingGeometry;
  private selectionMat!: THREE.MeshBasicMaterial;
  private onSelectionChange?: (item: PlacedPropItem | null, count: number) => void;
  private onPlacementComplete?: () => void;

  constructor(
    materials: StudioMaterialLibrary,
    textures: StudioTextureSet,
    callbacks?: {
      onSelectionChange?: (item: PlacedPropItem | null, count: number) => void;
      onPlacementComplete?: () => void;
    }
  ) {
    super();
    this.materials = materials;
    this.textures = textures;
    this.onSelectionChange = callbacks?.onSelectionChange;
    this.onPlacementComplete = callbacks?.onPlacementComplete;
    this.propsRoot.name = 'SceneryPropsRoot';
    this.add(this.propsRoot);

    this.selectionGeo = new THREE.RingGeometry(0.24, 0.29, 36);
    this.selectionGeo.rotateX(-Math.PI / 2);
    this.selectionMat = new THREE.MeshBasicMaterial({
      color: 0x60a5fa,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.selectionRing = new THREE.Mesh(this.selectionGeo, this.selectionMat);
    this.selectionRing.position.y = 0.012;
    this.selectionRing.visible = false;
    this.add(this.selectionRing);
  }

  public seedStarterScenery(): void {
    this.placePropAt('pine', new THREE.Vector3(-1.55, 0, -2.35), 0.2);
    this.placePropAt('boulders', new THREE.Vector3(-1.2, 0, -2.1), 0.7);
    this.placePropAt('lantern', new THREE.Vector3(1.38, 0, -2.05), -0.5);
    this.placePropAt('pine', new THREE.Vector3(1.75, 0, -2.45), 1.1);
    this.selectItem(null);
  }

  public armPropPlacement(propType: SceneryPropType): void {
    this.armedPlacement = { kind: 'prop', propType };
  }

  public armImagePlacement(asset: DroppedImageAsset): void {
    this.armedPlacement = { kind: 'image', asset };
  }

  public clearArmedPlacement(): void {
    this.armedPlacement = null;
  }

  public get isPlacementArmed(): boolean {
    return this.armedPlacement !== null;
  }

  public getSelectedItem(): PlacedPropItem | null {
    return this.items.find((i) => i.id === this.selectedId) ?? null;
  }

  public getItemCount(): number {
    return this.items.length;
  }

  public getExportGroup(): THREE.Group {
    this.propsRoot.updateMatrixWorld(true);
    return this.propsRoot;
  }

  public raycastGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const renderer = xb.core.renderer;
    const camera = xb.core.camera;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !camera) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitPoint);
    if (!hit) return null;

    // Keep within 4.2m studio floor radius
    const dx = hit.x - STAGE_POSITION.x;
    const dz = hit.z - STAGE_POSITION.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4.2) {
      hit.x = STAGE_POSITION.x + (dx / dist) * 4.2;
      hit.z = STAGE_POSITION.z + (dz / dist) * 4.2;
    }
    return hit.clone();
  }

  public hitTestProp(clientX: number, clientY: number): PlacedPropItem | null {
    const renderer = xb.core.renderer;
    const camera = xb.core.camera;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !camera) {
      return null;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, camera);

    const roots = this.items.map((i) => i.group);
    const hits = _raycaster.intersectObjects(roots, true);
    if (hits.length === 0) return null;

    let obj: THREE.Object3D | null = hits[0].object;
    while (obj) {
      const found = this.items.find((i) => i.group === obj);
      if (found) return found;
      obj = obj.parent;
    }
    return null;
  }

  public handleCanvasClick(clientX: number, clientY: number): boolean {
    if (this.armedPlacement) {
      const pt = this.raycastGround(clientX, clientY);
      if (!pt) return false;
      if (this.armedPlacement.kind === 'prop') {
        this.placePropAt(this.armedPlacement.propType, pt, Math.random() * Math.PI * 2);
      } else {
        this.placeImageBackdrop(this.armedPlacement.asset, pt);
      }
      this.armedPlacement = null;
      this.onPlacementComplete?.();
      return true;
    }

    const hitProp = this.hitTestProp(clientX, clientY);
    if (hitProp) {
      this.selectItem(hitProp.id);
      return true;
    }
    this.selectItem(null);
    return false;
  }

  public moveSelectedToScreenPoint(clientX: number, clientY: number): void {
    const selected = this.getSelectedItem();
    if (!selected) return;
    const pt = this.raycastGround(clientX, clientY);
    if (!pt) return;
    selected.group.position.set(pt.x, 0, pt.z);
    this.updateSelectionRing();
  }

  public selectItem(id: string | null): void {
    this.selectedId = id;
    this.updateSelectionRing();
    this.onSelectionChange?.(this.getSelectedItem(), this.items.length);
  }

  public rotateSelected(deltaRad = Math.PI / 4): void {
    const item = this.getSelectedItem();
    if (!item) return;
    item.group.rotation.y += deltaRad;
  }

  public deleteSelected(): void {
    if (!this.selectedId) return;
    const idx = this.items.findIndex((i) => i.id === this.selectedId);
    if (idx === -1) return;
    const [removed] = this.items.splice(idx, 1);
    this.propsRoot.remove(removed.group);
    removed.dispose();
    this.selectItem(null);
  }

  public clearAll(): void {
    for (const item of this.items) {
      this.propsRoot.remove(item.group);
      item.dispose();
    }
    this.items = [];
    this.selectItem(null);
  }

  private updateSelectionRing(): void {
    const item = this.getSelectedItem();
    if (!item) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.visible = true;
    this.selectionRing.position.set(item.group.position.x, 0.012, item.group.position.z);
  }

  public placePropAt(
    type: SceneryPropType,
    position: THREE.Vector3,
    rotationY = 0
  ): PlacedPropItem {
    const id = `prop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const built = this.buildProceduralProp(type);
    built.group.position.set(position.x, 0, position.z);
    built.group.rotation.y = rotationY;
    this.propsRoot.add(built.group);

    const item: PlacedPropItem = {
      id,
      kind: type,
      label: built.label,
      group: built.group,
      dispose: built.dispose,
    };
    this.items.push(item);
    this.selectItem(id);
    return item;
  }

  public placeImageBackdrop(
    asset: DroppedImageAsset,
    position?: THREE.Vector3
  ): PlacedPropItem {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const pos =
      position ??
      new THREE.Vector3(
        (this.items.filter((i) => i.kind === 'image').length % 2 === 0 ? -1 : 1) *
          0.95,
        0,
        -2.25
      );

    const built = this.buildImageFrameGroup(asset);
    built.group.position.set(pos.x, 0, pos.z);
    built.group.lookAt(STAGE_POSITION.x, 0, STAGE_POSITION.z + 1.2);
    this.propsRoot.add(built.group);

    const item: PlacedPropItem = {
      id,
      kind: 'image',
      label: asset.name.slice(0, 18),
      group: built.group,
      dispose: built.dispose,
    };
    this.items.push(item);
    this.selectItem(id);
    return item;
  }

  private buildImageFrameGroup(asset: DroppedImageAsset): {
    group: THREE.Group;
    dispose: () => void;
  } {
    const group = new THREE.Group();
    group.name = `DroppedBackdrop_${asset.name}`;
    const geometries: THREE.BufferGeometry[] = [];
    const disposables: Array<{ dispose: () => void }> = [];
    const track = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    const aspect =
      asset.width > 0 && asset.height > 0
        ? Math.min(2.0, Math.max(0.55, asset.width / asset.height))
        : 1.5;
    const panelH = 0.72;
    const panelW = panelH * aspect;
    const centerY = 0.92;

    // 1. Contact shadow
    const shadowGeo = track(new THREE.PlaneGeometry(0.65, 0.45));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    group.add(shadow);

    // 2. Weighted studio stand base + twin riser posts
    const footGeo = track(new THREE.BoxGeometry(0.46, 0.032, 0.24));
    const foot = new THREE.Mesh(footGeo, this.materials.slatePlinth);
    foot.position.y = 0.016;
    foot.castShadow = true;
    foot.receiveShadow = true;
    group.add(foot);

    const postGeo = track(new THREE.CylinderGeometry(0.014, 0.018, 0.92, 16));
    const postL = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
    postL.position.set(-panelW * 0.28, 0.48, -0.02);
    postL.castShadow = true;
    const postR = new THREE.Mesh(postGeo, this.materials.secondaryMetal);
    postR.position.set(panelW * 0.28, 0.48, -0.02);
    postR.castShadow = true;
    group.add(postL, postR);

    // 3. Beveled outer studio bezel frame
    const bezelGeo = track(new THREE.BoxGeometry(panelW + 0.06, panelH + 0.06, 0.035));
    const bezel = new THREE.Mesh(bezelGeo, this.materials.heroMetal);
    bezel.position.set(0, centerY, -0.005);
    bezel.castShadow = true;
    group.add(bezel);

    // 4. Dropped Image Canvas Plane (SRGBColorSpace)
    const imgEl = new Image();
    imgEl.src = asset.dataUrl;
    const tex = new THREE.Texture(imgEl);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    imgEl.onload = () => {
      tex.needsUpdate = true;
    };
    if (imgEl.complete) tex.needsUpdate = true;
    disposables.push(tex);

    const canvasMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.05,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 0.22,
    });
    disposables.push(canvasMat);

    const canvasGeo = track(new THREE.PlaneGeometry(panelW, panelH));
    const canvasMesh = new THREE.Mesh(canvasGeo, canvasMat);
    canvasMesh.position.set(0, centerY, 0.016);
    group.add(canvasMesh);

    return {
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        disposables.forEach((d) => d.dispose());
      },
    };
  }

  private buildProceduralProp(type: SceneryPropType): {
    label: string;
    group: THREE.Group;
    dispose: () => void;
  } {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const localMaterials: THREE.Material[] = [];
    const track = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };

    const shadowGeo = track(new THREE.PlaneGeometry(0.55, 0.55));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    group.add(shadow);

    let label = 'Prop';

    if (type === 'pine') {
      label = 'Cypress Pine';
      const trunkGeo = track(new THREE.CylinderGeometry(0.025, 0.048, 0.34, 12));
      const trunk = new THREE.Mesh(trunkGeo, this.materials.walnutWood);
      trunk.position.y = 0.17;
      trunk.castShadow = true;
      group.add(trunk);

      const tierSpecs = [
        { r: 0.24, h: 0.36, y: 0.42 },
        { r: 0.19, h: 0.32, y: 0.62 },
        { r: 0.14, h: 0.28, y: 0.8 },
        { r: 0.08, h: 0.22, y: 0.96 },
      ];
      for (const t of tierSpecs) {
        const coneGeo = track(new THREE.ConeGeometry(t.r, t.h, 14));
        const cone = new THREE.Mesh(coneGeo, this.materials.foliage);
        cone.position.y = t.y;
        cone.castShadow = true;
        cone.receiveShadow = true;
        group.add(cone);
      }
    } else if (type === 'boulders') {
      label = 'Moss Boulders';
      const stoneMat = new THREE.MeshStandardMaterial({
        color: 0x5c6472,
        roughness: 0.88,
        metalness: 0.05,
        flatShading: true,
      });
      localMaterials.push(stoneMat);

      const specs = [
        { r: 0.18, pos: [0, 0.11, 0], scale: [1.2, 0.78, 1.05] },
        { r: 0.12, pos: [0.16, 0.08, 0.09], scale: [1.0, 0.72, 1.1] },
        { r: 0.1, pos: [-0.14, 0.07, -0.07], scale: [1.1, 0.68, 0.95] },
      ];
      for (const s of specs) {
        const rockGeo = track(new THREE.IcosahedronGeometry(s.r, 1));
        const rock = new THREE.Mesh(rockGeo, stoneMat);
        rock.position.set(s.pos[0], s.pos[1], s.pos[2]);
        rock.scale.set(s.scale[0], s.scale[1], s.scale[2]);
        rock.castShadow = true;
        rock.receiveShadow = true;
        group.add(rock);
      }
      const capGeo = track(new THREE.SphereGeometry(0.11, 14, 10));
      capGeo.scale(1.1, 0.32, 1.0);
      const cap = new THREE.Mesh(capGeo, this.materials.moss);
      cap.position.set(0, 0.22, 0);
      group.add(cap);
    } else if (type === 'lantern') {
      label = 'Wayfinder Lamp';
      const baseGeo = track(new THREE.CylinderGeometry(0.08, 0.11, 0.06, 8));
      const base = new THREE.Mesh(baseGeo, this.materials.slatePlinth);
      base.position.y = 0.03;
      base.castShadow = true;
      group.add(base);

      const postCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.05, 0),
        new THREE.Vector3(0, 0.58, 0),
        new THREE.Vector3(0, 0.92, 0.06),
        new THREE.Vector3(0, 0.98, 0.18),
      ]);
      const armGeo = track(new THREE.TubeGeometry(postCurve, 24, 0.015, 10, false));
      const arm = new THREE.Mesh(armGeo, this.materials.secondaryMetal);
      arm.castShadow = true;
      group.add(arm);

      const capGeo = track(new THREE.ConeGeometry(0.085, 0.06, 8));
      const cap = new THREE.Mesh(capGeo, this.materials.heroMetal);
      cap.position.set(0, 0.93, 0.18);
      group.add(cap);

      const glassGeo = track(new THREE.CylinderGeometry(0.052, 0.044, 0.11, 8));
      const glass = new THREE.Mesh(glassGeo, this.materials.glassDome);
      glass.position.set(0, 0.85, 0.18);
      group.add(glass);

      const coreGeo = track(new THREE.SphereGeometry(0.024, 16, 12));
      const core = new THREE.Mesh(coreGeo, this.materials.emissiveAccent);
      core.position.set(0, 0.85, 0.18);
      group.add(core);
    } else {
      label = 'Studio Arch';
      const pierGeo = track(new THREE.BoxGeometry(0.11, 0.95, 0.14));
      const pierL = new THREE.Mesh(pierGeo, this.materials.slatePlinth);
      pierL.position.set(-0.38, 0.475, 0);
      pierL.castShadow = true;
      const pierR = new THREE.Mesh(pierGeo, this.materials.slatePlinth);
      pierR.position.set(0.38, 0.475, 0);
      pierR.castShadow = true;
      group.add(pierL, pierR);

      const archGeo = track(new THREE.TorusGeometry(0.38, 0.045, 16, 40, Math.PI));
      const arch = new THREE.Mesh(archGeo, this.materials.heroMetal);
      arch.position.set(0, 0.95, 0);
      arch.castShadow = true;
      group.add(arch);

      const neonGeo = track(new THREE.TorusGeometry(0.33, 0.012, 10, 40, Math.PI));
      const neon = new THREE.Mesh(neonGeo, this.materials.emissiveAccent);
      neon.position.set(0, 0.95, 0.02);
      group.add(neon);
    }

    return {
      label,
      group,
      dispose: () => {
        geometries.forEach((g) => g.dispose());
        localMaterials.forEach((m) => m.dispose());
      },
    };
  }

  dispose(): void {
    this.clearAll();
    this.selectionGeo.dispose();
    this.selectionMat.dispose();
  }
}
