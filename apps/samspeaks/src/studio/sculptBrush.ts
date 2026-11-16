import * as THREE from 'three';
import * as xb from 'xrblocks';

interface ActiveStroke {
  points: THREE.Vector3[];
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

const _cursorPos = new THREE.Vector3();

/**
 * Interactive 3D sculpting / light-ribbon painter in XR space.
 * Active only when paint mode is toggled on, leaving UI cards and subject manipulation untouched otherwise.
 */
export class SpatialBrush extends xb.Script {
  public enabled = false;
  private material: THREE.Material;
  private strokesGroup = new THREE.Group();
  private completedStrokes: THREE.Mesh[] = [];
  private activeStrokes = new Map<THREE.Object3D, ActiveStroke>();
  private onStrokeCountChange?: (count: number) => void;

  constructor(material: THREE.Material, onStrokeCountChange?: (count: number) => void) {
    super();
    this.material = material;
    this.onStrokeCountChange = onStrokeCountChange;
    this.strokesGroup.name = 'SpatialBrushStrokes';
    this.add(this.strokesGroup);
  }

  public get strokeCount(): number {
    return this.completedStrokes.length;
  }

  public getExportGroup(): THREE.Group {
    this.strokesGroup.updateMatrixWorld(true);
    return this.strokesGroup;
  }

  public setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      this.activeStrokes.clear();
    }
  }

  public clearStrokes(): void {
    for (const mesh of this.completedStrokes) {
      this.strokesGroup.remove(mesh);
      mesh.geometry.dispose();
    }
    this.completedStrokes = [];
    this.activeStrokes.clear();
    this.onStrokeCountChange?.(0);
  }

  private getBrushPoint(event: xb.SelectEvent): THREE.Vector3 {
    if (event.intersection?.point) {
      // Paint slightly in front of surface or along ray at fixed studio depth
      _cursorPos.copy(event.intersection.point);
      return _cursorPos.clone();
    }
    const controller = event.source.controller;
    _cursorPos.set(0, 0, -0.45);
    controller.localToWorld(_cursorPos);
    return _cursorPos.clone();
  }

  private isUIOrManipulableTarget(target: THREE.Object3D | undefined): boolean {
    let curr: THREE.Object3D | null | undefined = target;
    while (curr) {
      if ((curr as { isUI?: boolean }).isUI) return true;
      if (curr.xb?.manipulation) return true;
      curr = curr.parent;
    }
    return false;
  }

  onSelectStart(event: xb.SelectEvent): void {
    if (!this.enabled) return;
    if (this.isUIOrManipulableTarget(event.target)) return;

    const controller = event.source.controller;
    const startPt = this.getBrushPoint(event);
    const secondPt = startPt.clone().add(new THREE.Vector3(0.002, 0.002, 0));

    const curve = new THREE.CatmullRomCurve3([startPt, secondPt]);
    const geometry = new THREE.TubeGeometry(curve, 8, 0.011, 8, false);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.xb = { pointerEvents: 'none' };
    this.strokesGroup.add(mesh);

    this.activeStrokes.set(controller, {
      points: [startPt, secondPt],
      mesh,
      geometry,
    });
    event.stopPropagation();
  }

  onSelecting(event: xb.SelectEvent): void {
    if (!this.enabled) return;
    const controller = event.source.controller;
    const stroke = this.activeStrokes.get(controller);
    if (!stroke) return;

    const nextPt = this.getBrushPoint(event);
    const lastPt = stroke.points[stroke.points.length - 1];
    if (lastPt.distanceToSquared(nextPt) < 0.0004) return;

    stroke.points.push(nextPt);
    const segments = Math.min(220, Math.max(8, stroke.points.length * 4));
    const curve = new THREE.CatmullRomCurve3(stroke.points);
    const nextGeo = new THREE.TubeGeometry(curve, segments, 0.011, 8, false);
    stroke.mesh.geometry = nextGeo;
    stroke.geometry.dispose();
    stroke.geometry = nextGeo;
    event.stopPropagation();
  }

  onSelectEnd(event: xb.SelectEvent): void {
    const controller = event.source.controller;
    const stroke = this.activeStrokes.get(controller);
    if (!stroke) return;

    this.activeStrokes.delete(controller);
    this.completedStrokes.push(stroke.mesh);
    this.onStrokeCountChange?.(this.completedStrokes.length);
  }

  private webStroke: ActiveStroke | null = null;

  public startWebStroke(point: THREE.Vector3): void {
    if (!this.enabled) return;
    const startPt = point.clone();
    const secondPt = startPt.clone().add(new THREE.Vector3(0.002, 0.002, 0));
    const curve = new THREE.CatmullRomCurve3([startPt, secondPt]);
    const geometry = new THREE.TubeGeometry(curve, 8, 0.011, 8, false);
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.castShadow = true;
    mesh.xb = { pointerEvents: 'none' };
    this.strokesGroup.add(mesh);
    this.webStroke = { points: [startPt, secondPt], mesh, geometry };
  }

  public moveWebStroke(point: THREE.Vector3): void {
    if (!this.enabled || !this.webStroke) return;
    const stroke = this.webStroke;
    const lastPt = stroke.points[stroke.points.length - 1];
    if (lastPt.distanceToSquared(point) < 0.0005) return;

    stroke.points.push(point.clone());
    const segments = Math.min(220, Math.max(8, stroke.points.length * 4));
    const curve = new THREE.CatmullRomCurve3(stroke.points);
    const nextGeo = new THREE.TubeGeometry(curve, segments, 0.011, 8, false);
    stroke.mesh.geometry = nextGeo;
    stroke.geometry.dispose();
    stroke.geometry = nextGeo;
  }

  public endWebStroke(): void {
    if (!this.webStroke) return;
    this.completedStrokes.push(this.webStroke.mesh);
    this.webStroke = null;
    this.onStrokeCountChange?.(this.completedStrokes.length);
  }

  dispose(): void {
    this.webStroke = null;
    this.clearStrokes();
  }
}
