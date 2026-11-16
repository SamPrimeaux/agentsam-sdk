import * as THREE from 'three';
import type { FinishPreset } from '../types.ts';
import type { StudioTextureSet } from './textures.ts';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

export class StudioMaterialLibrary {
  public readonly heroMetal: THREE.MeshPhysicalMaterial;
  public readonly secondaryMetal: THREE.MeshPhysicalMaterial;
  public readonly opticalGlass: THREE.MeshPhysicalMaterial;
  public readonly glassDome: THREE.MeshPhysicalMaterial;
  public readonly slatePlinth: THREE.MeshStandardMaterial;
  public readonly walnutWood: THREE.MeshStandardMaterial;
  public readonly travertine: THREE.MeshStandardMaterial;
  public readonly emissiveAccent: THREE.MeshStandardMaterial;
  public readonly studioFloor: THREE.MeshStandardMaterial;
  public readonly micMesh: THREE.MeshStandardMaterial;
  public readonly foliage: THREE.MeshStandardMaterial;
  public readonly moss: THREE.MeshStandardMaterial;
  public readonly contactShadow: THREE.MeshBasicMaterial;
  public readonly dialTop: THREE.MeshStandardMaterial;
  public readonly paintRibbon: THREE.MeshPhysicalMaterial;

  constructor(textures: StudioTextureSet, isSoftwareGl: boolean) {
    this.heroMetal = new THREE.MeshPhysicalMaterial({
      color: 0xe8b954,
      metalness: 0.94,
      roughness: 0.18,
      roughnessMap: textures.brushedRoughness,
      anisotropy: 0.8,
      anisotropyRotation: 0.25,
      clearcoat: 0.25,
      clearcoatRoughness: 0.12,
      emissive: 0x332200,
      emissiveIntensity: 0.08,
    });

    this.secondaryMetal = new THREE.MeshPhysicalMaterial({
      color: 0x9aa6b8,
      metalness: 0.9,
      roughness: 0.34,
      roughnessMap: textures.brushedRoughness,
      anisotropy: 0.5,
    });

    this.opticalGlass = new THREE.MeshPhysicalMaterial({
      color: 0xdff2ff,
      metalness: 0.0,
      roughness: 0.04,
      transmission: isSoftwareGl ? 0 : 0.92,
      transparent: true,
      opacity: isSoftwareGl ? 0.38 : 1.0,
      ior: 1.58,
      thickness: 0.28,
      attenuationColor: new THREE.Color(0x6ec3ff),
      attenuationDistance: 0.45,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    });

    this.glassDome = new THREE.MeshPhysicalMaterial({
      color: 0xeef8ff,
      metalness: 0.0,
      roughness: 0.05,
      transmission: isSoftwareGl ? 0 : 0.88,
      transparent: true,
      opacity: isSoftwareGl ? 0.28 : 0.96,
      ior: 1.5,
      thickness: 0.04,
      clearcoat: 1.0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.slatePlinth = new THREE.MeshStandardMaterial({
      color: 0x1e2430,
      metalness: 0.12,
      roughness: 0.74,
    });

    this.walnutWood = new THREE.MeshStandardMaterial({
      color: 0x6a442d,
      metalness: 0.04,
      roughness: 0.62,
      bumpMap: textures.brushedRoughness,
      bumpScale: 0.004,
    });

    this.travertine = new THREE.MeshStandardMaterial({
      color: 0xd9d0c1,
      metalness: 0.02,
      roughness: 0.82,
      bumpMap: textures.brushedRoughness,
      bumpScale: 0.003,
    });

    this.emissiveAccent = new THREE.MeshStandardMaterial({
      color: 0x76b8ff,
      emissive: 0x4b96ff,
      emissiveIntensity: 1.4,
      roughness: 0.22,
      metalness: 0.1,
    });

    this.studioFloor = new THREE.MeshStandardMaterial({
      map: textures.studioFloor,
      roughness: 0.84,
      metalness: 0.12,
    });

    this.micMesh = new THREE.MeshStandardMaterial({
      color: 0xc2c8d2,
      metalness: 0.86,
      roughness: 0.35,
      bumpMap: textures.micGrillBump,
      bumpScale: 0.012,
    });

    this.foliage = new THREE.MeshStandardMaterial({
      color: 0x3b8c5a,
      roughness: 0.78,
      metalness: 0.02,
    });

    this.moss = new THREE.MeshStandardMaterial({
      color: 0x2f5e3e,
      roughness: 0.92,
      metalness: 0.0,
    });

    this.contactShadow = new THREE.MeshBasicMaterial({
      map: textures.radialShadow,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });

    this.dialTop = new THREE.MeshStandardMaterial({
      map: textures.turntableDial,
      roughness: 0.42,
      metalness: 0.38,
    });

    this.paintRibbon = new THREE.MeshPhysicalMaterial({
      color: 0xe8b954,
      emissive: 0x4b96ff,
      emissiveIntensity: 0.45,
      metalness: 0.68,
      roughness: 0.22,
      clearcoat: 0.8,
      clearcoatRoughness: 0.1,
    });
  }

  applyFinish(preset: FinishPreset): void {
    this.heroMetal.color.setHex(preset.color);
    this.heroMetal.metalness = preset.metalness;
    this.heroMetal.roughness = preset.roughness;
    this.heroMetal.anisotropy = preset.anisotropy;
    this.heroMetal.iridescence = preset.iridescence;
    this.heroMetal.emissive.setHex(preset.emissive);
    this.heroMetal.emissiveIntensity = preset.emissiveIntensity;
    this.heroMetal.needsUpdate = true;

    this.paintRibbon.color.setHex(preset.color);
    this.paintRibbon.emissive.setHex(preset.color);
    this.paintRibbon.emissiveIntensity = 0.28;
    this.paintRibbon.iridescence = preset.iridescence;
  }

  dispose(): void {
    this.heroMetal.dispose();
    this.secondaryMetal.dispose();
    this.opticalGlass.dispose();
    this.glassDome.dispose();
    this.slatePlinth.dispose();
    this.walnutWood.dispose();
    this.travertine.dispose();
    this.emissiveAccent.dispose();
    this.studioFloor.dispose();
    this.micMesh.dispose();
    this.foliage.dispose();
    this.moss.dispose();
    this.contactShadow.dispose();
    this.dialTop.dispose();
    this.paintRibbon.dispose();
  }
}
