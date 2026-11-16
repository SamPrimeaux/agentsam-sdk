import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as xb from 'xrblocks';
import { CAMERA_SHOT_MAP } from '../constants.ts';
import type { CameraShotId, TransitionType } from '../types.ts';

const _goalPos = new THREE.Vector3();
const _goalTarget = new THREE.Vector3();
const _offset = new THREE.Vector3();

/**
 * Web-friendly damped OrbitControls + cinematic guided camera transition director.
 * Automatically yields to user drag/zoom and disables when an XR session presents.
 */
export class CameraDirector {
  private controls: OrbitControls | null = null;
  private isSoftwareGl = false;
  private transitionActive = false;
  private transitionMode: TransitionType = 'glide';
  private transitionElapsed = 0;
  private transitionDuration = 1.4;
  private startPos = new THREE.Vector3();
  private startTarget = new THREE.Vector3();
  private endPos = new THREE.Vector3();
  private endTarget = new THREE.Vector3();
  public autoTour = false;
  private draggingProp = false;

  init(isSoftwareGl: boolean): void {
    this.isSoftwareGl = isSoftwareGl;
    const renderer = xb.core.renderer;
    const camera = xb.core.camera;
    if (!renderer || !('domElement' in renderer) || !renderer.domElement || !camera) {
      return;
    }

    camera.position.set(0.35, 1.55, 1.05);
    this.controls = new OrbitControls(camera, renderer.domElement);
    this.controls.target.set(0, 1.05, -1.25);
    this.controls.enableDamping = !isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 0.45;
    this.controls.maxDistance = 6.5;
    this.controls.update();

    this.controls.addEventListener('start', () => {
      // Cancel scripted transition immediately so user controls never fight
      this.transitionActive = false;
      this.autoTour = false;
    });
  }

  public setDraggingProp(dragging: boolean): void {
    this.draggingProp = dragging;
    if (this.controls) {
      this.controls.enabled = !dragging && !this.isXrPresenting();
    }
  }

  public setAutoTour(enabled: boolean): void {
    this.autoTour = enabled;
    if (enabled) {
      this.transitionActive = false;
    }
  }

  public goToShot(shotId: CameraShotId, transition: TransitionType = 'glide'): void {
    const preset = CAMERA_SHOT_MAP[shotId] || CAMERA_SHOT_MAP.establishing;
    _goalPos.set(preset.position[0], preset.position[1], preset.position[2]);
    _goalTarget.set(preset.target[0], preset.target[1], preset.target[2]);
    this.beginTransition(_goalPos, _goalTarget, transition);
  }

  public focusOnWorldPoint(point: THREE.Vector3, transition: TransitionType = 'glide'): void {
    _goalTarget.copy(point);
    _goalTarget.y += 0.35;
    _goalPos.set(point.x + 0.55, point.y + 0.72, point.z + 1.05);
    this.beginTransition(_goalPos, _goalTarget, transition);
  }

  private beginTransition(
    pos: THREE.Vector3,
    target: THREE.Vector3,
    mode: TransitionType
  ): void {
    const camera = xb.core.camera;
    if (!camera || !this.controls) return;

    this.autoTour = false;
    if (mode === 'cut') {
      camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.transitionActive = false;
      return;
    }

    this.transitionMode = mode;
    this.transitionElapsed = 0;
    this.transitionDuration = mode === 'dolly' ? 1.8 : mode === 'crane' ? 1.9 : 1.45;
    this.startPos.copy(camera.position);
    this.startTarget.copy(this.controls.target);
    this.endPos.copy(pos);
    this.endTarget.copy(target);
    this.transitionActive = true;
  }

  private isXrPresenting(): boolean {
    return Boolean(xb.core.renderer?.xr?.isPresenting);
  }

  public update(dt: number): void {
    if (!this.controls || !xb.core.camera) return;

    const xrActive = this.isXrPresenting();
    this.controls.enabled = !xrActive && !this.draggingProp;
    if (xrActive) return;

    const camera = xb.core.camera;

    if (this.transitionActive) {
      this.transitionElapsed += dt;
      const rawT = Math.min(1, this.transitionElapsed / this.transitionDuration);
      // Smooth quintic ease-in-out
      const t = rawT * rawT * rawT * (rawT * (rawT * 6 - 15) + 10);

      camera.position.lerpVectors(this.startPos, this.endPos, t);
      this.controls.target.lerpVectors(this.startTarget, this.endTarget, t);

      if (this.transitionMode === 'orbit') {
        const arc = Math.sin(rawT * Math.PI) * 0.45;
        camera.position.x += arc;
      } else if (this.transitionMode === 'crane') {
        const lift = Math.sin(rawT * Math.PI) * 0.55;
        camera.position.y += lift;
      }

      if (rawT >= 1) {
        this.transitionActive = false;
      }
    } else if (this.autoTour && !this.draggingProp) {
      _offset.copy(camera.position).sub(this.controls.target);
      const angle = dt * 0.24;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nx = _offset.x * cos - _offset.z * sin;
      const nz = _offset.x * sin + _offset.z * cos;
      _offset.x = nx;
      _offset.z = nz;
      camera.position.copy(this.controls.target).add(_offset);
    }

    if (!this.isSoftwareGl) {
      this.controls.update();
    } else {
      camera.lookAt(this.controls.target);
    }
  }

  dispose(): void {
    this.controls?.dispose();
    this.controls = null;
  }
}
