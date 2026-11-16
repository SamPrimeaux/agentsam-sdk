import * as THREE from 'three';
import * as xb from 'xrblocks';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ATMOSPHERE_MAP, FINISH_MAP } from '../constants.ts';
import type {
  AtmosphereMoodId,
  AudioLevels,
  DynamicLightingState,
  FinishId,
  StudioSubjectId,
  StudioSubjectInstance,
  TransitionType,
} from '../types.ts';
import { detectSoftwareWebGL, StudioMaterialLibrary } from './materials.ts';
import { createStudioSubject } from './subjects.ts';
import { createStudioTextures, type StudioTextureSet } from './textures.ts';

export const STAGE_POSITION = new THREE.Vector3(0, 0, -1.25);
const PLATTER_HEIGHT = 0.88;
const SPECTRUM_COUNT = 32;

const _scratchVec = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _hsl = { h: 0, s: 0, l: 0 };
const _targetFogColor = new THREE.Color(0x131314);
const _targetKeyColor = new THREE.Color(0xfff0da);
const _targetHemiSky = new THREE.Color(0xd0e2ff);
const _targetHemiGround = new THREE.Color(0x171719);
const _targetRimColor = new THREE.Color(0x409cff);

export class StudioStage extends xb.Script {
  public isSoftwareGl = false;
  public textures!: StudioTextureSet;
  public materials!: StudioMaterialLibrary;
  public floorMesh!: THREE.Mesh;

  private envTexture: THREE.Texture | null = null;
  private keyLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private softboxLeft: THREE.RectAreaLight | null = null;
  private softboxRight: THREE.RectAreaLight | null = null;
  private fog!: THREE.FogExp2;
  private bgColor = new THREE.Color(0x131314);

  private stageGroup = new THREE.Group();
  private turntablePlatter = new THREE.Group();
  private subjectAnchor = new THREE.Group();
  private spectrumMesh!: THREE.InstancedMesh;
  private speakerVuRing!: THREE.Mesh;

  private activeSubject: StudioSubjectInstance | null = null;
  private currentSubjectId: StudioSubjectId = 'astrolabe';
  private currentFinishId: FinishId = 'gold';
  private currentMoodId: AtmosphereMoodId = 'studio';

  private targetExplode = 0;
  private currentExplode = 0;
  private targetSpinSpeed = 0.28;
  private currentSpinSpeed = 0.28;
  private targetKeyAngle = 0.65;
  private currentKeyAngle = 0.65;
  private targetKeyIntensity = 2.6;
  private targetHemiIntensity = 1.15;
  private targetRimIntensity = 1.35;
  private targetSoftboxLeftIntensity = 4.2;
  private targetSoftboxRightIntensity = 3.0;
  private targetFogDensity = 0.05;
  private targetExposure = 1.12;
  private targetAmbientHue = 217;
  private currentAmbientHue = 217;
  private targetAmbientSaturation = 0.72;
  private currentAmbientSaturation = 0.72;
  private targetAmbientLightness = 0.72;
  private currentAmbientLightness = 0.72;
  private targetGroundLightness = 0.16;
  private currentGroundLightness = 0.16;
  private targetShadowSoftness = 2.5;
  private currentShadowSoftness = 2.5;
  private transitionPulse = 0;

  private stageGeometries: THREE.BufferGeometry[] = [];
  private spectrumMaterial: THREE.MeshStandardMaterial | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.isSoftwareGl = detectSoftwareWebGL();
    const renderer = xb.core.renderer;
    let maxAnisotropy = 4;

    if (renderer && 'toneMapping' in renderer) {
      const webgl = renderer as THREE.WebGLRenderer;
      webgl.outputColorSpace = THREE.SRGBColorSpace;
      webgl.toneMapping = THREE.ACESFilmicToneMapping;
      webgl.toneMappingExposure = 1.12;
      webgl.setPixelRatio(
        this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      if (webgl.shadowMap) {
        webgl.shadowMap.enabled = !this.isSoftwareGl;
        webgl.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      maxAnisotropy = webgl.capabilities?.getMaxAnisotropy?.() ?? 4;

      const pmrem = new THREE.PMREMGenerator(webgl);
      const roomEnv = new RoomEnvironment();
      this.envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
      xb.core.scene.environment = this.envTexture;
      roomEnv.dispose();
      pmrem.dispose();
    }

    this.textures = createStudioTextures(maxAnisotropy);
    this.materials = new StudioMaterialLibrary(this.textures, this.isSoftwareGl);

    this.setupLighting();
    this.buildStageEnvironment();
    this.setSubject(this.currentSubjectId);
    this.setFinish(this.currentFinishId);
    this.setAtmosphereMood(this.currentMoodId, true);
  }

  onXRSessionStarted(): void {
    if (xb.core.environmentBlendMode === 'alpha-blend') {
      xb.core.scene.background = null;
    }
  }

  onXRSessionEnded(): void {
    xb.core.scene.background = this.bgColor;
  }

  private trackGeo<T extends THREE.BufferGeometry>(geo: T): T {
    this.stageGeometries.push(geo);
    return geo;
  }

  private setupLighting(): void {
    this.hemiLight = new THREE.HemisphereLight(0xc4dbff, 0x161b26, 1.15);
    this.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff0da, 2.6);
    this.keyLight.position.set(1.6, 2.8, 0.9);
    this.keyLight.target.position.copy(STAGE_POSITION).setY(PLATTER_HEIGHT + 0.2);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 0.5;
    this.keyLight.shadow.camera.far = 9;
    const d = 2.4;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.018;
    this.keyLight.shadow.radius = this.currentShadowSoftness;
    this.add(this.keyLight, this.keyLight.target);

    this.rimLight = new THREE.DirectionalLight(0x6da8ff, 1.35);
    this.rimLight.position.set(-1.5, 2.2, -2.8);
    this.rimLight.target.position.copy(STAGE_POSITION).setY(PLATTER_HEIGHT + 0.2);
    this.add(this.rimLight, this.rimLight.target);

    if (!this.isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      this.softboxLeft = new THREE.RectAreaLight(0xfff4e6, 4.2, 1.1, 1.6);
      this.softboxLeft.position.set(-1.35, 1.45, -0.8);
      this.softboxLeft.lookAt(
        STAGE_POSITION.x,
        PLATTER_HEIGHT + 0.25,
        STAGE_POSITION.z
      );
      this.add(this.softboxLeft);

      this.softboxRight = new THREE.RectAreaLight(0x9bc4ff, 3.0, 1.0, 1.5);
      this.softboxRight.position.set(1.35, 1.35, -1.65);
      this.softboxRight.lookAt(
        STAGE_POSITION.x,
        PLATTER_HEIGHT + 0.25,
        STAGE_POSITION.z
      );
      this.add(this.softboxRight);
    }

    this.fog = new THREE.FogExp2(0x131314, 0.05);
    xb.core.scene.fog = this.fog;
    xb.core.scene.background = this.bgColor;
  }

  private buildStageEnvironment(): void {
    this.stageGroup.position.copy(STAGE_POSITION);
    this.add(this.stageGroup);

    // Expanded studio & adventure floor disc (radius 4.6m)
    const floorGeo = this.trackGeo(new THREE.CircleGeometry(4.6, 64));
    floorGeo.rotateX(-Math.PI / 2);
    this.floorMesh = new THREE.Mesh(floorGeo, this.materials.studioFloor);
    this.floorMesh.position.y = 0.0;
    this.floorMesh.receiveShadow = true;
    this.floorMesh.name = 'StudioGroundFloor';
    this.stageGroup.add(this.floorMesh);

    const floorRingGeo = this.trackGeo(new THREE.RingGeometry(1.18, 1.2, 64));
    floorRingGeo.rotateX(-Math.PI / 2);
    const floorRing = new THREE.Mesh(floorRingGeo, this.materials.secondaryMetal);
    floorRing.position.y = 0.004;
    this.stageGroup.add(floorRing);

    const outerRingGeo = this.trackGeo(new THREE.RingGeometry(2.65, 2.68, 64));
    outerRingGeo.rotateX(-Math.PI / 2);
    const outerRing = new THREE.Mesh(outerRingGeo, this.materials.secondaryMetal);
    outerRing.position.y = 0.004;
    this.stageGroup.add(outerRing);

    this.buildPedestal();
    this.buildMicStandProp();
    this.buildSpeakerTowerProp();
  }

  private buildPedestal(): void {
    const pedestal = new THREE.Group();
    pedestal.name = 'StudioPedestal';
    this.stageGroup.add(pedestal);

    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(1.05, 1.05));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.006;
    pedestal.add(shadow);

    const footGeo = this.trackGeo(new THREE.CylinderGeometry(0.28, 0.34, 0.08, 8));
    const foot = new THREE.Mesh(footGeo, this.materials.slatePlinth);
    foot.position.y = 0.04;
    foot.castShadow = true;
    foot.receiveShadow = true;
    pedestal.add(foot);

    const colGeo = this.trackGeo(new THREE.CylinderGeometry(0.11, 0.16, 0.68, 32));
    const col = new THREE.Mesh(colGeo, this.materials.secondaryMetal);
    col.position.y = 0.42;
    col.castShadow = true;
    col.receiveShadow = true;
    pedestal.add(col);

    const collarGeo = this.trackGeo(new THREE.CylinderGeometry(0.29, 0.19, 0.09, 36));
    const collar = new THREE.Mesh(collarGeo, this.materials.walnutWood);
    collar.position.y = 0.79;
    collar.castShadow = true;
    collar.receiveShadow = true;
    pedestal.add(collar);

    this.turntablePlatter.position.y = 0.855;
    pedestal.add(this.turntablePlatter);

    const platterRimGeo = this.trackGeo(new THREE.CylinderGeometry(0.32, 0.31, 0.048, 48));
    const platterRim = new THREE.Mesh(platterRimGeo, this.materials.secondaryMetal);
    platterRim.castShadow = true;
    platterRim.receiveShadow = true;
    this.turntablePlatter.add(platterRim);

    const dialGeo = this.trackGeo(new THREE.CircleGeometry(0.305, 48));
    dialGeo.rotateX(-Math.PI / 2);
    const dial = new THREE.Mesh(dialGeo, this.materials.dialTop);
    dial.position.y = 0.025;
    dial.receiveShadow = true;
    this.turntablePlatter.add(dial);

    this.subjectAnchor.position.y = 0.025;
    this.subjectAnchor.xb = {
      manipulation: {
        actions: {
          translate: false,
          rotate: { axis: 'y', space: 'local' },
          scale: { minScale: 0.65, maxScale: 1.7 },
        },
      },
    };
    this.turntablePlatter.add(this.subjectAnchor);

    const barGeo = this.trackGeo(new THREE.BoxGeometry(0.014, 0.036, 0.014));
    this.spectrumMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x3b82f6,
      emissiveIntensity: 0.7,
      roughness: 0.25,
      metalness: 0.4,
    });
    this.spectrumMesh = new THREE.InstancedMesh(
      barGeo,
      this.spectrumMaterial,
      SPECTRUM_COUNT
    );
    this.spectrumMesh.position.y = 0.855;
    this.spectrumMesh.frustumCulled = false;
    for (let i = 0; i < SPECTRUM_COUNT; i++) {
      const angle = (i / SPECTRUM_COUNT) * Math.PI * 2;
      _dummy.position.set(Math.cos(angle) * 0.345, 0, Math.sin(angle) * 0.345);
      _dummy.rotation.set(0, -angle, 0);
      _dummy.scale.set(1, 0.35, 1);
      _dummy.updateMatrix();
      this.spectrumMesh.setMatrixAt(i, _dummy.matrix);
      _color.setHSL(0.55 + (i / SPECTRUM_COUNT) * 0.22, 0.78, 0.62);
      this.spectrumMesh.setColorAt(i, _color);
    }
    this.spectrumMesh.instanceMatrix.needsUpdate = true;
    if (this.spectrumMesh.instanceColor) {
      this.spectrumMesh.instanceColor.needsUpdate = true;
    }
    this.spectrumMesh.computeBoundingSphere();
    pedestal.add(this.spectrumMesh);
  }

  private buildMicStandProp(): void {
    const micGroup = new THREE.Group();
    micGroup.name = 'StudioBoomMicrophone';
    micGroup.position.set(-0.78, 0, -0.08);
    micGroup.rotation.y = 0.45;
    this.stageGroup.add(micGroup);

    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.46, 0.46));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    micGroup.add(shadow);

    const baseGeo = this.trackGeo(new THREE.CylinderGeometry(0.13, 0.15, 0.032, 32));
    const base = new THREE.Mesh(baseGeo, this.materials.slatePlinth);
    base.position.y = 0.016;
    base.castShadow = true;
    base.receiveShadow = true;
    micGroup.add(base);

    const shaftGeo = this.trackGeo(new THREE.CylinderGeometry(0.013, 0.018, 0.96, 16));
    const shaft = new THREE.Mesh(shaftGeo, this.materials.secondaryMetal);
    shaft.position.y = 0.5;
    shaft.castShadow = true;
    micGroup.add(shaft);

    const jointGeo = this.trackGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.045, 16));
    const joint = new THREE.Mesh(jointGeo, this.materials.heroMetal);
    joint.position.y = 0.98;
    micGroup.add(joint);

    const boomCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.14, 0.96, -0.08),
      new THREE.Vector3(0, 0.99, 0),
      new THREE.Vector3(0.24, 1.1, 0.1),
    ]);
    const boomGeo = this.trackGeo(new THREE.TubeGeometry(boomCurve, 24, 0.01, 10, false));
    const boom = new THREE.Mesh(boomGeo, this.materials.secondaryMetal);
    boom.castShadow = true;
    micGroup.add(boom);

    const capsuleGroup = new THREE.Group();
    capsuleGroup.position.set(0.24, 1.07, 0.1);
    capsuleGroup.rotation.z = 0.25;

    const mountGeo = this.trackGeo(new THREE.TorusGeometry(0.044, 0.005, 10, 28));
    mountGeo.rotateX(Math.PI / 2);
    const mount = new THREE.Mesh(mountGeo, this.materials.heroMetal);

    const bodyGeo = this.trackGeo(new THREE.CylinderGeometry(0.026, 0.022, 0.085, 24));
    const body = new THREE.Mesh(bodyGeo, this.materials.slatePlinth);
    body.position.y = -0.02;

    const headGeo = this.trackGeo(new THREE.CapsuleGeometry(0.027, 0.042, 8, 24));
    const head = new THREE.Mesh(headGeo, this.materials.micMesh);
    head.position.y = 0.045;
    capsuleGroup.add(mount, body, head);
    micGroup.add(capsuleGroup);

    const popGeo = this.trackGeo(new THREE.TorusGeometry(0.056, 0.004, 10, 32));
    const pop = new THREE.Mesh(popGeo, this.materials.secondaryMetal);
    pop.position.set(0.3, 1.1, 0.14);
    pop.rotation.y = Math.PI / 3;
    micGroup.add(pop);
  }

  private buildSpeakerTowerProp(): void {
    const tower = new THREE.Group();
    tower.name = 'StudioMonitorSpeaker';
    tower.position.set(0.78, 0, -0.08);
    tower.rotation.y = -0.45;
    this.stageGroup.add(tower);

    const shadowGeo = this.trackGeo(new THREE.PlaneGeometry(0.5, 0.5));
    shadowGeo.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(shadowGeo, this.materials.contactShadow);
    shadow.position.y = 0.005;
    tower.add(shadow);

    const baseGeo = this.trackGeo(new THREE.BoxGeometry(0.28, 0.032, 0.26));
    const base = new THREE.Mesh(baseGeo, this.materials.slatePlinth);
    base.position.y = 0.016;
    base.castShadow = true;
    tower.add(base);

    const standGeo = this.trackGeo(new THREE.CylinderGeometry(0.024, 0.032, 0.68, 16));
    const stand = new THREE.Mesh(standGeo, this.materials.secondaryMetal);
    stand.position.y = 0.36;
    stand.castShadow = true;
    tower.add(stand);

    const cabShape = new THREE.Shape();
    cabShape.moveTo(-0.11, -0.15);
    cabShape.lineTo(0.11, -0.15);
    cabShape.lineTo(0.11, 0.15);
    cabShape.lineTo(-0.11, 0.15);
    cabShape.closePath();
    const cabGeo = this.trackGeo(
      new THREE.ExtrudeGeometry(cabShape, {
        depth: 0.2,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 3,
      })
    );
    cabGeo.center();
    const cabinet = new THREE.Mesh(cabGeo, this.materials.walnutWood);
    cabinet.position.y = 0.87;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    tower.add(cabinet);

    const baffleGeo = this.trackGeo(new THREE.BoxGeometry(0.2, 0.28, 0.016));
    const baffle = new THREE.Mesh(baffleGeo, this.materials.slatePlinth);
    baffle.position.set(0, 0.87, 0.112);
    tower.add(baffle);

    const conePts = [
      new THREE.Vector2(0.014, 0.0),
      new THREE.Vector2(0.068, 0.022),
      new THREE.Vector2(0.075, 0.022),
    ];
    const wooferGeo = this.trackGeo(new THREE.LatheGeometry(conePts, 32));
    wooferGeo.rotateX(Math.PI / 2);
    const woofer = new THREE.Mesh(wooferGeo, this.materials.secondaryMetal);
    woofer.position.set(0, 0.81, 0.105);
    tower.add(woofer);

    const tweeterGeo = this.trackGeo(new THREE.SphereGeometry(0.022, 20, 16));
    const tweeter = new THREE.Mesh(tweeterGeo, this.materials.heroMetal);
    tweeter.position.set(0, 0.945, 0.116);
    tweeter.scale.set(1, 1, 0.5);
    tower.add(tweeter);

    const vuGeo = this.trackGeo(new THREE.TorusGeometry(0.076, 0.005, 12, 36));
    this.speakerVuRing = new THREE.Mesh(vuGeo, this.materials.emissiveAccent);
    this.speakerVuRing.position.set(0, 0.81, 0.122);
    tower.add(this.speakerVuRing);
  }

  public setSubject(id: StudioSubjectId): void {
    this.currentSubjectId = id;
    if (this.activeSubject) {
      this.subjectAnchor.remove(this.activeSubject.root);
      this.activeSubject.dispose();
      this.activeSubject = null;
    }
    this.activeSubject = createStudioSubject(id, this.materials);
    this.subjectAnchor.add(this.activeSubject.root);
    this.applyExplodeImmediate(this.currentExplode);
  }

  public setFinish(id: FinishId): void {
    this.currentFinishId = id;
    this.materials.applyFinish(FINISH_MAP[id]);
  }

  public setAtmosphereMood(id: AtmosphereMoodId, immediate = false): void {
    this.currentMoodId = id;
    const preset = ATMOSPHERE_MAP[id];
    _targetFogColor.setHex(preset.fogColor);
    _targetKeyColor.setHex(preset.keyColor);
    _targetHemiSky.setHex(preset.hemiSky);
    _targetHemiGround.setHex(preset.hemiGround);
    _targetRimColor.setHex(preset.rimColor);
    _targetHemiSky.getHSL(_hsl);
    this.targetAmbientHue = Math.round(_hsl.h * 360);
    this.targetAmbientSaturation = Number(_hsl.s.toFixed(2));
    this.targetAmbientLightness = _hsl.l;
    _targetHemiGround.getHSL(_hsl);
    this.targetGroundLightness = _hsl.l;

    this.targetKeyIntensity = preset.keyIntensity;
    this.targetHemiIntensity = preset.hemiIntensity;
    this.targetRimIntensity = preset.rimIntensity;
    this.targetFogDensity = preset.fogDensity;
    this.targetExposure = preset.exposure;
    this.syncSoftboxIntensities(preset.keyIntensity);

    if (immediate) {
      this.currentAmbientHue = this.targetAmbientHue;
      this.currentAmbientSaturation = this.targetAmbientSaturation;
      this.currentAmbientLightness = this.targetAmbientLightness;
      this.currentGroundLightness = this.targetGroundLightness;
      this.currentShadowSoftness = this.targetShadowSoftness;
      this.currentKeyAngle = this.targetKeyAngle;
      this.keyLight.color.copy(_targetKeyColor);
      this.keyLight.intensity = this.targetKeyIntensity;
      this.hemiLight.color.copy(_targetHemiSky);
      this.hemiLight.groundColor.copy(_targetHemiGround);
      this.hemiLight.intensity = this.targetHemiIntensity;
      this.rimLight.color.copy(_targetRimColor);
      this.rimLight.intensity = this.targetRimIntensity;
      if (this.softboxLeft) this.softboxLeft.intensity = this.targetSoftboxLeftIntensity;
      if (this.softboxRight) this.softboxRight.intensity = this.targetSoftboxRightIntensity;
      this.fog.color.copy(_targetFogColor);
      this.fog.density = this.targetFogDensity;
      this.bgColor.copy(_targetFogColor);
    }
  }

  public triggerTransitionEffect(type: TransitionType): void {
    if (type === 'cut') {
      this.transitionPulse = 0.65;
    } else if (type === 'orbit' || type === 'crane') {
      this.transitionPulse = 0.35;
    } else {
      this.transitionPulse = 0.2;
    }
  }

  public setExplodeAmount(value: number): void {
    this.targetExplode = THREE.MathUtils.clamp(value, 0, 1);
  }

  public setSpinSpeed(value: number): void {
    this.targetSpinSpeed = THREE.MathUtils.clamp(value, 0, 2);
  }

  public setKeyLightAngle(radians: number): void {
    this.targetKeyAngle = radians;
  }

  public setKeyLightIntensity(value: number): void {
    this.targetKeyIntensity = THREE.MathUtils.clamp(value, 0, 5);
    this.syncSoftboxIntensities(this.targetKeyIntensity);
  }

  public setAmbientColorHsl(hueDeg: number, saturation?: number): void {
    this.targetAmbientHue = ((hueDeg % 360) + 360) % 360;
    if (saturation !== undefined) {
      this.targetAmbientSaturation = THREE.MathUtils.clamp(saturation, 0, 1);
    }
    this.targetAmbientLightness = 0.72;
    this.targetGroundLightness = 0.2;
    const h = this.targetAmbientHue / 360;
    _targetHemiSky.setHSL(h, this.targetAmbientSaturation, this.targetAmbientLightness);
    _targetHemiGround.setHSL(h, this.targetAmbientSaturation * 0.68, this.targetGroundLightness);
  }

  public setAmbientIntensity(value: number): void {
    this.targetHemiIntensity = THREE.MathUtils.clamp(value, 0, 2.5);
  }

  public setShadowSoftness(value: number): void {
    this.targetShadowSoftness = THREE.MathUtils.clamp(value, 0.5, 10);
  }

  public resetLighting(): void {
    this.targetKeyAngle = 0.65;
    this.setShadowSoftness(2.5);
    this.setAtmosphereMood(this.currentMoodId);
  }

  public getLightingState(): DynamicLightingState {
    return {
      keyIntensity: Number(this.targetKeyIntensity.toFixed(2)),
      ambientHue: Math.round(this.targetAmbientHue),
      ambientSaturation: Number(this.targetAmbientSaturation.toFixed(2)),
      ambientIntensity: Number(this.targetHemiIntensity.toFixed(2)),
      ambientHex: `#${_targetHemiSky.getHexString()}`,
      shadowSoftness: Number(this.targetShadowSoftness.toFixed(2)),
      keyAngle: Number(this.targetKeyAngle.toFixed(2)),
    };
  }

  private syncSoftboxIntensities(keyIntensity: number): void {
    const ratio = keyIntensity / 2.6;
    this.targetSoftboxLeftIntensity = 4.2 * ratio;
    this.targetSoftboxRightIntensity = 3.0 * ratio;
  }

  public getExportGroup(): THREE.Group {
    this.stageGroup.updateMatrixWorld(true);
    return this.stageGroup;
  }

  public resetViewPose(): void {
    this.subjectAnchor.rotation.set(0, 0, 0);
    this.subjectAnchor.scale.setScalar(1);
    this.targetExplode = 0;
    this.targetSpinSpeed = 0.28;
    this.targetKeyAngle = 0.65;
    this.setShadowSoftness(2.5);
    this.setAtmosphereMood('studio');
  }

  private applyExplodeImmediate(amount: number): void {
    if (!this.activeSubject) return;
    for (const part of this.activeSubject.explodableParts) {
      _scratchVec.copy(part.explodeOffset).multiplyScalar(amount);
      part.object.position.copy(part.basePosition).add(_scratchVec);
    }
  }

  public updateStage(elapsed: number, dt: number, audio: AudioLevels): void {
    const damp = 1 - Math.exp(-8 * dt);
    const lightLambda = 3.6;
    const lightDamp = 1 - Math.exp(-lightLambda * dt);

    this.currentExplode = THREE.MathUtils.damp(this.currentExplode, this.targetExplode, 8, dt);
    this.currentSpinSpeed = THREE.MathUtils.damp(
      this.currentSpinSpeed,
      this.targetSpinSpeed,
      8,
      dt
    );
    this.currentKeyAngle = THREE.MathUtils.damp(
      this.currentKeyAngle,
      this.targetKeyAngle,
      lightLambda,
      dt
    );
    this.transitionPulse *= Math.exp(-6 * dt);

    // Smoothly transition key, rim, softboxes, ambient HSL hue arc, and shadow softness
    this.keyLight.color.lerp(_targetKeyColor, lightDamp);
    this.keyLight.intensity = THREE.MathUtils.damp(
      this.keyLight.intensity,
      this.targetKeyIntensity,
      lightLambda,
      dt
    );

    const hueDiff = ((this.targetAmbientHue - this.currentAmbientHue + 540) % 360) - 180;
    this.currentAmbientHue = (this.currentAmbientHue + hueDiff * lightDamp + 360) % 360;
    this.currentAmbientSaturation = THREE.MathUtils.damp(
      this.currentAmbientSaturation,
      this.targetAmbientSaturation,
      lightLambda,
      dt
    );
    this.currentAmbientLightness = THREE.MathUtils.damp(
      this.currentAmbientLightness,
      this.targetAmbientLightness,
      lightLambda,
      dt
    );
    this.currentGroundLightness = THREE.MathUtils.damp(
      this.currentGroundLightness,
      this.targetGroundLightness,
      lightLambda,
      dt
    );

    const h = this.currentAmbientHue / 360;
    this.hemiLight.color.setHSL(h, this.currentAmbientSaturation, this.currentAmbientLightness);
    this.hemiLight.groundColor.setHSL(
      h,
      this.currentAmbientSaturation * 0.68,
      this.currentGroundLightness
    );
    this.hemiLight.intensity = THREE.MathUtils.damp(
      this.hemiLight.intensity,
      this.targetHemiIntensity,
      lightLambda,
      dt
    );

    this.rimLight.color.lerp(_targetRimColor, lightDamp);
    this.rimLight.intensity = THREE.MathUtils.damp(
      this.rimLight.intensity,
      this.targetRimIntensity,
      lightLambda,
      dt
    );

    if (this.softboxLeft) {
      this.softboxLeft.intensity = THREE.MathUtils.damp(
        this.softboxLeft.intensity,
        this.targetSoftboxLeftIntensity,
        lightLambda,
        dt
      );
    }
    if (this.softboxRight) {
      this.softboxRight.intensity = THREE.MathUtils.damp(
        this.softboxRight.intensity,
        this.targetSoftboxRightIntensity,
        lightLambda,
        dt
      );
    }

    this.currentShadowSoftness = THREE.MathUtils.damp(
      this.currentShadowSoftness,
      this.targetShadowSoftness,
      lightLambda,
      dt
    );
    this.keyLight.shadow.radius = this.currentShadowSoftness;
    this.keyLight.shadow.normalBias = 0.012 + this.currentShadowSoftness * 0.0025;
    if (this.materials?.contactShadow) {
      this.materials.contactShadow.opacity = THREE.MathUtils.clamp(
        0.56 - (this.currentShadowSoftness - 0.5) * 0.028,
        0.24,
        0.58
      );
    }

    this.fog.color.lerp(_targetFogColor, lightDamp);
    this.fog.density = THREE.MathUtils.damp(
      this.fog.density,
      this.targetFogDensity,
      lightLambda,
      dt
    );
    this.bgColor.copy(this.fog.color);

    const renderer = xb.core.renderer;
    if (renderer && 'toneMappingExposure' in renderer) {
      const webgl = renderer as THREE.WebGLRenderer;
      const desiredExposure = this.targetExposure - this.transitionPulse * 0.45;
      webgl.toneMappingExposure +=
        (desiredExposure - webgl.toneMappingExposure) * damp;
    }

    const lightRadius = 2.2;
    this.keyLight.position.set(
      STAGE_POSITION.x + Math.cos(this.currentKeyAngle) * lightRadius,
      2.65,
      STAGE_POSITION.z + Math.sin(this.currentKeyAngle) * lightRadius
    );

    this.turntablePlatter.rotation.y += dt * this.currentSpinSpeed;

    if (this.activeSubject) {
      this.applyExplodeImmediate(this.currentExplode);
      this.activeSubject.updateAnimation(elapsed, dt, audio);
    }

    const vuScale = 1 + audio.low * 0.14;
    this.speakerVuRing.scale.set(vuScale, vuScale, 1);

    for (let i = 0; i < SPECTRUM_COUNT; i++) {
      const angle = (i / SPECTRUM_COUNT) * Math.PI * 2;
      const band =
        i % 3 === 0 ? audio.low : i % 3 === 1 ? audio.mid : audio.high;
      const wave = 0.25 + 0.12 * Math.sin(elapsed * 2.5 + i * 0.45);
      const heightScale = wave + band * 2.2;
      _dummy.position.set(
        Math.cos(angle) * 0.345,
        (heightScale - 0.35) * 0.015,
        Math.sin(angle) * 0.345
      );
      _dummy.rotation.set(0, -angle, 0);
      _dummy.scale.set(1, heightScale, 1);
      _dummy.updateMatrix();
      this.spectrumMesh.setMatrixAt(i, _dummy.matrix);
    }
    this.spectrumMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    if (this.activeSubject) {
      this.activeSubject.dispose();
      this.activeSubject = null;
    }
    this.stageGeometries.forEach((g) => g.dispose());
    this.stageGeometries = [];
    this.spectrumMaterial?.dispose();
    this.materials?.dispose();
    this.textures?.dispose();
    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
    }
  }
}
