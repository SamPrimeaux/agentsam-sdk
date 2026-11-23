import * as THREE from 'three';
import { SKY_PRESET_MAP } from './constants.ts';
import type {
  AudioLevels,
  SkyCelestialBody,
  SkyPresetId,
  SkySceneConfig,
  SkyTriggerMode,
} from './types.ts';

const _dummy = new THREE.Object3D();
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();

const SKY_DOME_VERTEX = /* glsl */ `
  varying vec3 vWorldDir;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldDir = normalize(position);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const SKY_DOME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uProgression;
  uniform vec2 uHover;
  uniform float uAudioPulse;
  uniform vec3 uZenithColor;
  uniform vec3 uHorizonColor;
  uniform vec3 uNadirColor;
  uniform vec3 uCloudPrimary;
  uniform vec3 uCloudAccent;
  uniform vec3 uNebulaPrimary;
  uniform vec3 uNebulaSecondary;
  uniform vec3 uSunColor;
  uniform float uCloudDensity;
  uniform float uCloudScale;
  uniform float uCirrusWisps;
  uniform float uStarIntensity;
  uniform float uGalaxyIntensity;
  uniform float uAuroraIntensity;
  uniform float uGlowIntensity;
  uniform float uSunElevation;

  varying vec3 vWorldDir;
  varying vec2 vUv;

  float hash31(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise3D(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 0.0)), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float fbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(37.0, 17.0, 53.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise3D(p);
      p = p * 2.04 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float elev = clamp(dir.y, -1.0, 1.0);
    float upperT = smoothstep(-0.08, 0.85, elev);
    float lowerT = smoothstep(-0.65, 0.04, elev);

    // Diurnal / multi-phase color shift driven by uProgression (0=starry night, 0.35=rose dawn, 0.65=azure noon, 0.9=twilight)
    vec3 nightZenith = vec3(0.03, 0.05, 0.14);
    vec3 dawnHorizon = vec3(0.95, 0.65, 0.78);
    vec3 noonZenith = vec3(0.16, 0.45, 0.92);

    float dawnPhase = smoothstep(0.1, 0.4, uProgression) * (1.0 - smoothstep(0.45, 0.75, uProgression));
    float dayPhase = smoothstep(0.35, 0.72, uProgression) * (1.0 - smoothstep(0.78, 0.98, uProgression));

    vec3 dynZenith = mix(uZenithColor, noonZenith, dayPhase * 0.55);
    dynZenith = mix(dynZenith, nightZenith, (1.0 - smoothstep(0.05, 0.35, uProgression)) * 0.45);
    vec3 dynHorizon = mix(uHorizonColor, dawnHorizon, dawnPhase * 0.65);

    vec3 skyCol = mix(uNadirColor, dynHorizon, lowerT);
    skyCol = mix(skyCol, dynZenith, pow(upperT, 0.78));

    // Sun / Celestial Core position responds to uSunElevation, uProgression, and uHover
    float sunAngle = (uProgression - 0.5) * 2.4 + uHover.x * 0.65;
    float sunY = clamp(uSunElevation + uHover.y * 0.25 + sin(uProgression * 3.14159) * 0.25, 0.04, 0.88);
    vec3 sunDir = normalize(vec3(sin(sunAngle) * 0.8, sunY, -cos(sunAngle)));
    float sunDot = max(0.0, dot(dir, sunDir));

    // Outer Space Galactic Band & Nebula FBM
    if (uGalaxyIntensity > 0.01 && elev > -0.15) {
      vec3 galCoord = dir * 2.2 + vec3(uTime * 0.015, -uTime * 0.01, uProgression * 1.4);
      float band = exp(-pow((dir.x * 0.65 + dir.y * 0.55 - 0.18) * 3.2, 2.0));
      float nebA = fbm(galCoord * 1.6);
      float nebB = fbm(galCoord * 3.1 + vec3(12.4));
      float dustLane = smoothstep(0.38, 0.68, nebB);
      vec3 nebColor = mix(uNebulaPrimary, uNebulaSecondary, nebA);
      nebColor += uSunColor * pow(nebA * band, 2.4) * 0.8;
      float galMask = smoothstep(-0.1, 0.25, elev) * uGalaxyIntensity;
      skyCol += nebColor * (band * 0.85 + 0.35) * dustLane * galMask * (0.75 + uAudioPulse * 0.45);
    }

    // Crisp Starfield Layer
    if (uStarIntensity > 0.01 && elev > -0.05) {
      vec3 starGrid = floor(dir * 260.0);
      float starSeed = hash31(starGrid);
      float starThresh = 1.0 - (0.008 * uStarIntensity);
      if (starSeed > starThresh) {
        float twinkle = 0.55 + 0.45 * sin(uTime * 3.5 + starSeed * 1200.0);
        float starBright = smoothstep(starThresh, 1.0, starSeed) * twinkle * smoothstep(-0.05, 0.25, elev);
        vec3 starTint = mix(vec3(0.85, 0.92, 1.0), uSunColor, fract(starSeed * 53.7));
        skyCol += starTint * starBright * 2.4 * uStarIntensity * (1.0 - dayPhase * 0.65);
      }
    }

    // Polar Aurora Borealis Curtains
    if (uAuroraIntensity > 0.01 && elev > 0.02) {
      vec2 aurUv = dir.xz / (dir.y + 0.32);
      float wave1 = sin(aurUv.x * 2.4 + uTime * 0.55 + uHover.x * 2.0) * 0.5 + 0.5;
      float wave2 = fbm(vec3(aurUv * 1.8, uTime * 0.22));
      float curtain = smoothstep(0.38, 0.74, wave1 * 0.5 + wave2 * 0.65);
      float verticalFade = smoothstep(0.04, 0.28, elev) * (1.0 - smoothstep(0.45, 0.88, elev));
      vec3 aurCol = mix(uCloudPrimary, uCloudAccent, sin(aurUv.y * 1.6 + uTime * 0.4) * 0.5 + 0.5);
      skyCol += aurCol * curtain * verticalFade * uAuroraIntensity * (0.85 + uAudioPulse * 0.6);
    }

    // Volumetric Cumulus & Painted Cirrus Wisps (inspired by the reference sky recording)
    if (uCloudDensity > 0.01 && elev > -0.08) {
      vec3 cloudProj = dir / max(0.16, elev + 0.24);
      vec3 drift = vec3(uTime * 0.045 + uHover.x * 0.45, uProgression * 0.85, uTime * 0.028 + uHover.y * 0.35);
      float baseNoise = fbm(cloudProj * (0.45 * uCloudScale) + drift);
      float detailNoise = fbm(cloudProj * (1.25 * uCloudScale) - drift * 1.35);
      float wisps = fbm(vec3(cloudProj.x * 1.9, cloudProj.z * 0.65, uTime * 0.05) * uCloudScale);

      float combined = mix(baseNoise, detailNoise, 0.38) + wisps * 0.28 * uCirrusWisps;
      float threshold = 1.02 - uCloudDensity * 0.68;
      float cloudMask = smoothstep(threshold, threshold + 0.36, combined) * smoothstep(-0.06, 0.16, elev);

      // Cloud silver-lining & rose/golden illumination
      float silverLining = pow(sunDot, 5.0) * 0.75 + pow(1.0 - clamp(elev, 0.0, 1.0), 3.0) * 0.35;
      vec3 litCloud = mix(uCloudAccent * 0.78, uCloudPrimary, smoothstep(threshold, threshold + 0.42, combined));
      litCloud = mix(litCloud, dawnHorizon, dawnPhase * 0.48);
      litCloud += uSunColor * silverLining * 0.68 * uGlowIntensity;

      skyCol = mix(skyCol, litCloud, clamp(cloudMask * 0.92, 0.0, 0.95));
    }

    // Solar / Accretion Halo Disc
    float sunHalo = pow(sunDot, 10.0) * 0.32 + pow(sunDot, 96.0) * 0.75 + smoothstep(0.9985, 0.9998, sunDot) * 1.25;
    skyCol += uSunColor * sunHalo * (0.65 + uAudioPulse * 0.35) * uGlowIntensity;

    gl_FragColor = vec4(skyCol, 1.0);
  }
`;

export class SkyGenerator {
  public readonly root = new THREE.Group();

  private config: SkySceneConfig;
  private skyDomeMesh!: THREE.Mesh;
  private skyDomeMat!: THREE.ShaderMaterial;

  // Celestial 3D props inside the upper dome (spiral galaxy, ringed planet, eclipse corona, comets)
  private celestialGroup = new THREE.Group();
  private galaxyGroup = new THREE.Group();
  private galaxyInstanced!: THREE.InstancedMesh;
  private galaxyCoreMesh!: THREE.Mesh;

  private planetGroup = new THREE.Group();
  private planetSphere!: THREE.Mesh;
  private planetRings!: THREE.Mesh;
  private planetMoonA!: THREE.Mesh;
  private planetMoonB!: THREE.Mesh;

  private eclipseGroup = new THREE.Group();
  private eclipseDisc!: THREE.Mesh;
  private eclipseCorona!: THREE.Mesh;

  private cometInstanced!: THREE.InstancedMesh;
  private cometCount = 24;
  private cometSeeds: Array<{
    angle: number;
    elev: number;
    speed: number;
    radius: number;
    length: number;
  }> = [];

  private hoverTarget = new THREE.Vector2(0, 0);
  private hoverCurrent = new THREE.Vector2(0, 0);
  private targetProgression = 0.36;
  private currentProgression = 0.36;

  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];

  constructor() {
    this.root.name = 'ProceduralSkyGenerator';
    this.config = { ...SKY_PRESET_MAP['diurnal-cloudscape'].config };
    this.targetProgression = this.config.progression;
    this.currentProgression = this.config.progression;
    this.buildSkyDome();
    this.buildCelestialActors();
    this.applyConfig(this.config, true);
  }

  private trackGeo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }

  private buildSkyDome(): void {
    const domeGeo = this.trackGeo(new THREE.SphereGeometry(24, 48, 32));
    this.skyDomeMat = this.trackMat(
      new THREE.ShaderMaterial({
        vertexShader: SKY_DOME_VERTEX,
        fragmentShader: SKY_DOME_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uProgression: { value: this.config.progression },
          uHover: { value: new THREE.Vector2(0, 0) },
          uAudioPulse: { value: 0 },
          uZenithColor: { value: new THREE.Color(this.config.zenithHex) },
          uHorizonColor: { value: new THREE.Color(this.config.horizonHex) },
          uNadirColor: { value: new THREE.Color(this.config.nadirHex) },
          uCloudPrimary: { value: new THREE.Color(this.config.cloudPrimaryHex) },
          uCloudAccent: { value: new THREE.Color(this.config.cloudAccentHex) },
          uNebulaPrimary: { value: new THREE.Color(this.config.nebulaPrimaryHex) },
          uNebulaSecondary: { value: new THREE.Color(this.config.nebulaSecondaryHex) },
          uSunColor: { value: new THREE.Color(this.config.sunHex) },
          uCloudDensity: { value: this.config.cloudDensity },
          uCloudScale: { value: this.config.cloudScale },
          uCirrusWisps: { value: this.config.cirrusWisps },
          uStarIntensity: { value: this.config.starIntensity },
          uGalaxyIntensity: { value: this.config.galaxyIntensity },
          uAuroraIntensity: { value: this.config.auroraIntensity },
          uGlowIntensity: { value: 1 },
          uSunElevation: { value: this.config.sunElevation },
        },
      })
    );

    this.skyDomeMesh = new THREE.Mesh(domeGeo, this.skyDomeMat);
    this.skyDomeMesh.renderOrder = -10;
    this.skyDomeMesh.frustumCulled = false;
    this.root.add(this.skyDomeMesh);
  }

  private buildCelestialActors(): void {
    this.celestialGroup.name = 'SkyCelestialBodies';
    this.root.add(this.celestialGroup);

    // 1. 3D Spiral Galaxy Arm Cluster (InstancedMesh > 20 stars)
    this.galaxyGroup.position.set(-3.2, 6.2, -11.5);
    this.galaxyGroup.rotation.set(0.58, 0.25, -0.32);
    const armStarCount = 220;
    const starGeo = this.trackGeo(new THREE.OctahedronGeometry(0.055, 0));
    const starMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        fog: false,
      })
    );
    this.galaxyInstanced = new THREE.InstancedMesh(starGeo, starMat, armStarCount);
    this.galaxyInstanced.frustumCulled = false;

    for (let i = 0; i < armStarCount; i++) {
      const arm = i % 3;
      const t = (i / armStarCount) * 4.6;
      const angle = t * 2.15 + (arm * Math.PI * 2) / 3;
      const radius = 0.28 + t * 0.92;
      const spread = (Math.sin(i * 19.7) * 0.24) * (0.3 + t * 0.15);
      const px = Math.cos(angle) * radius + spread;
      const pz = Math.sin(angle) * radius - spread;
      const py = Math.cos(i * 7.3) * 0.16 * (1 / (0.6 + t));

      _dummy.position.set(px, py, pz);
      const s = Math.max(0.35, 1.35 - t * 0.22);
      _dummy.scale.setScalar(s);
      _dummy.rotation.set(i * 0.4, i * 0.8, 0);
      _dummy.updateMatrix();
      this.galaxyInstanced.setMatrixAt(i, _dummy.matrix);

      _colorA.setHSL(0.74 - (t / 4.6) * 0.22, 0.88, 0.68);
      this.galaxyInstanced.setColorAt(i, _colorA);
    }
    this.galaxyInstanced.instanceMatrix.needsUpdate = true;
    if (this.galaxyInstanced.instanceColor) {
      this.galaxyInstanced.instanceColor.needsUpdate = true;
    }
    this.galaxyInstanced.computeBoundingSphere();

    const coreGeo = this.trackGeo(new THREE.SphereGeometry(0.55, 24, 18));
    coreGeo.scale(1.3, 0.42, 1.3);
    const coreMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.88,
        fog: false,
      })
    );
    this.galaxyCoreMesh = new THREE.Mesh(coreGeo, coreMat);
    this.galaxyGroup.add(this.galaxyCoreMesh, this.galaxyInstanced);
    this.celestialGroup.add(this.galaxyGroup);

    // 2. Ringed Exoplanet & Twin Moons
    this.planetGroup.position.set(4.6, 4.8, -12.8);
    this.planetGroup.rotation.set(0.24, -0.35, 0.42);

    const planetGeo = this.trackGeo(new THREE.SphereGeometry(1.75, 36, 28));
    const planetMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        roughness: 0.68,
        metalness: 0.15,
        emissive: 0x451a03,
        emissiveIntensity: 0.45,
        fog: false,
      })
    );
    this.planetSphere = new THREE.Mesh(planetGeo, planetMat);

    const ringGeo = this.trackGeo(new THREE.RingGeometry(2.15, 3.65, 64));
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        emissive: 0x92400e,
        emissiveIntensity: 0.4,
        roughness: 0.4,
        metalness: 0.35,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.78,
        fog: false,
      })
    );
    this.planetRings = new THREE.Mesh(ringGeo, ringMat);

    const moonGeoA = this.trackGeo(new THREE.SphereGeometry(0.26, 20, 16));
    const moonMatA = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: 0x0369a1,
        emissiveIntensity: 0.5,
        roughness: 0.5,
        fog: false,
      })
    );
    this.planetMoonA = new THREE.Mesh(moonGeoA, moonMatA);
    this.planetMoonA.position.set(-4.3, 0.6, 0.8);

    const moonGeoB = this.trackGeo(new THREE.SphereGeometry(0.16, 16, 14));
    this.planetMoonB = new THREE.Mesh(moonGeoB, ringMat);
    this.planetMoonB.position.set(4.1, -0.45, 1.1);

    this.planetGroup.add(
      this.planetSphere,
      this.planetRings,
      this.planetMoonA,
      this.planetMoonB
    );
    this.celestialGroup.add(this.planetGroup);

    // 3. Solar Eclipse / Supernova Accretion Corona
    this.eclipseGroup.position.set(0.0, 5.2, -13.2);
    const discGeo = this.trackGeo(new THREE.SphereGeometry(1.15, 32, 24));
    const discMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x03040a,
        fog: false,
      })
    );
    this.eclipseDisc = new THREE.Mesh(discGeo, discMat);

    const coronaGeo = this.trackGeo(new THREE.TorusGeometry(1.24, 0.11, 16, 72));
    const coronaMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.95,
        fog: false,
      })
    );
    this.eclipseCorona = new THREE.Mesh(coronaGeo, coronaMat);
    this.eclipseGroup.add(this.eclipseDisc, this.eclipseCorona);
    this.celestialGroup.add(this.eclipseGroup);

    // 4. Streaking Comet / Shooting Star Shower (InstancedMesh > 20)
    const cometGeo = this.trackGeo(new THREE.ConeGeometry(0.032, 0.72, 8));
    cometGeo.rotateX(Math.PI / 2);
    const cometMat = this.trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.85,
        fog: false,
      })
    );
    this.cometInstanced = new THREE.InstancedMesh(cometGeo, cometMat, this.cometCount);
    this.cometInstanced.frustumCulled = false;

    for (let i = 0; i < this.cometCount; i++) {
      this.cometSeeds.push({
        angle: (i / this.cometCount) * Math.PI * 2,
        elev: 2.8 + (i % 6) * 1.15,
        speed: 0.35 + (i % 5) * 0.14,
        radius: 10.5 + (i % 4) * 1.8,
        length: 0.7 + (i % 3) * 0.45,
      });
    }
    this.celestialGroup.add(this.cometInstanced);
  }

  public setPreset(presetId: SkyPresetId): SkySceneConfig {
    const preset = SKY_PRESET_MAP[presetId] || SKY_PRESET_MAP['diurnal-cloudscape'];
    this.applyConfig({
      ...preset.config,
      triggerMode: this.config.triggerMode,
      immersiveSkyOnly: this.config.immersiveSkyOnly,
    });
    return this.getConfig();
  }

  /** Toggle the real sun halo and cloud silver-lining contribution in the sky shader. */
  public setGlowEnabled(enabled: boolean): void {
    this.skyDomeMat.uniforms.uGlowIntensity.value = enabled ? 1 : 0;
  }

  public applyConfig(patch: Partial<SkySceneConfig>, immediate = false): SkySceneConfig {
    this.config = {
      ...this.config,
      ...patch,
    };

    this.targetProgression = THREE.MathUtils.clamp(this.config.progression, 0, 1);
    if (immediate) {
      this.currentProgression = this.targetProgression;
    }

    const u = this.skyDomeMat.uniforms;
    u.uZenithColor.value.set(this.config.zenithHex);
    u.uHorizonColor.value.set(this.config.horizonHex);
    u.uNadirColor.value.set(this.config.nadirHex);
    u.uCloudPrimary.value.set(this.config.cloudPrimaryHex);
    u.uCloudAccent.value.set(this.config.cloudAccentHex);
    u.uNebulaPrimary.value.set(this.config.nebulaPrimaryHex);
    u.uNebulaSecondary.value.set(this.config.nebulaSecondaryHex);
    u.uSunColor.value.set(this.config.sunHex);
    u.uCloudDensity.value = THREE.MathUtils.clamp(this.config.cloudDensity, 0, 1);
    u.uCloudScale.value = THREE.MathUtils.clamp(this.config.cloudScale, 0.5, 5);
    u.uCirrusWisps.value = THREE.MathUtils.clamp(this.config.cirrusWisps, 0, 1);
    u.uStarIntensity.value = THREE.MathUtils.clamp(this.config.starIntensity, 0, 1.5);
    u.uGalaxyIntensity.value = THREE.MathUtils.clamp(this.config.galaxyIntensity, 0, 1.5);
    u.uAuroraIntensity.value = THREE.MathUtils.clamp(this.config.auroraIntensity, 0, 1.5);
    u.uSunElevation.value = THREE.MathUtils.clamp(this.config.sunElevation, 0.02, 0.92);

    this.syncCelestialVisibility(this.config.celestialBody);
    return this.getConfig();
  }

  private syncCelestialVisibility(body: SkyCelestialBody): void {
    this.galaxyGroup.visible = body === 'spiral-galaxy';
    this.planetGroup.visible = body === 'ringed-planet';
    this.eclipseGroup.visible = body === 'eclipse-corona' || body === 'twin-suns';
    this.cometInstanced.visible =
      body === 'comet-shower' ||
      body === 'spiral-galaxy' ||
      this.config.auroraIntensity > 0.5;
  }

  public getConfig(): SkySceneConfig {
    return {
      ...this.config,
      progression: Number(this.targetProgression.toFixed(2)),
    };
  }

  public setTriggerMode(mode: SkyTriggerMode): void {
    this.config.triggerMode = mode;
  }

  public setProgression(value: number): void {
    this.targetProgression = THREE.MathUtils.clamp(value, 0, 1);
    this.config.progression = this.targetProgression;
  }

  public handlePointerHover(normalizedX: number, normalizedY: number): void {
    this.hoverTarget.set(
      THREE.MathUtils.clamp(normalizedX, -1, 1),
      THREE.MathUtils.clamp(normalizedY, -1, 1)
    );
    if (this.config.triggerMode === 'hover-reactive') {
      // Map horizontal pointer scrub smoothly across diurnal/cosmic phases
      const scrubbed = THREE.MathUtils.clamp((normalizedX + 1) * 0.5, 0.02, 0.98);
      this.targetProgression = scrubbed;
      this.config.progression = Number(scrubbed.toFixed(2));
    }
  }

  public handleScrollDelta(deltaY: number): number {
    const step = deltaY * 0.00055;
    this.targetProgression = (this.targetProgression + step + 1.0) % 1.0;
    this.config.progression = Number(this.targetProgression.toFixed(2));
    return this.config.progression;
  }

  /**
   * Samples the current sky horizon & zenith tint so StudioStage fog and hemisphere light harmonize with the sky dome.
   */
  public sampleHorizonColor(target: THREE.Color): THREE.Color {
    _colorA.set(this.config.horizonHex);
    _colorB.set(this.config.zenithHex);
    return target.copy(_colorA).lerp(_colorB, 0.25);
  }

  public update(elapsed: number, dt: number, audio: AudioLevels): void {
    const damp = 1 - Math.exp(-5.5 * dt);
    this.hoverCurrent.lerp(this.hoverTarget, damp);

    if (this.config.triggerMode === 'orbit-time') {
      this.targetProgression = (this.targetProgression + dt * 0.018 * this.config.evolutionSpeed) % 1.0;
      this.config.progression = Number(this.targetProgression.toFixed(2));
    } else if (this.config.triggerMode === 'audio-reactive' && audio.isPlaying) {
      this.targetProgression = (this.targetProgression + dt * (0.04 + audio.overall * 0.22)) % 1.0;
    }

    this.currentProgression = THREE.MathUtils.damp(
      this.currentProgression,
      this.targetProgression,
      6.0,
      dt
    );

    const u = this.skyDomeMat.uniforms;
    u.uTime.value = elapsed * (0.5 + this.config.evolutionSpeed);
    u.uProgression.value = this.currentProgression;
    u.uHover.value.copy(this.hoverCurrent);
    u.uAudioPulse.value = THREE.MathUtils.damp(
      u.uAudioPulse.value,
      audio.overall * 1.4,
      10,
      dt
    );

    // Animate 3D celestial actors
    if (this.galaxyGroup.visible) {
      this.galaxyGroup.rotation.y += dt * 0.08 * (1 + audio.overall);
      this.galaxyGroup.position.x = -3.2 + this.hoverCurrent.x * 1.2;
      this.galaxyGroup.position.y = 6.2 + this.hoverCurrent.y * 0.8;
    }

    if (this.planetGroup.visible) {
      this.planetSphere.rotation.y += dt * 0.06;
      this.planetRings.rotation.z += dt * 0.04;
      const moonAngle = elapsed * 0.25 + this.currentProgression * Math.PI * 2;
      this.planetMoonA.position.set(
        Math.cos(moonAngle) * 4.2,
        Math.sin(moonAngle * 0.7) * 0.65,
        Math.sin(moonAngle) * 4.2
      );
      this.planetMoonB.position.set(
        Math.cos(-moonAngle * 1.3) * 3.8,
        Math.cos(moonAngle) * 0.45,
        Math.sin(-moonAngle * 1.3) * 3.8
      );
      this.planetGroup.position.y = 4.2 + this.currentProgression * 2.2 + this.hoverCurrent.y * 0.6;
    }

    if (this.eclipseGroup.visible) {
      const coronaScale = 1 + 0.08 * Math.sin(elapsed * 2.5) + audio.low * 0.25;
      this.eclipseCorona.scale.setScalar(coronaScale);
      this.eclipseGroup.position.x = this.hoverCurrent.x * 1.6;
      this.eclipseGroup.position.y = 4.6 + Math.sin(this.currentProgression * Math.PI) * 1.8;
    }

    if (this.cometInstanced.visible) {
      for (let i = 0; i < this.cometCount; i++) {
        const c = this.cometSeeds[i];
        const a = c.angle + elapsed * c.speed * (0.5 + this.config.evolutionSpeed) + this.currentProgression * 2.5;
        const r = c.radius;
        const px = Math.cos(a) * r;
        const pz = Math.sin(a) * r;
        const py = c.elev + Math.sin(a * 2.0 + i) * 1.1;

        _dummy.position.set(px, py, pz);
        _dummy.lookAt(
          px - Math.sin(a) * 2.0,
          py + Math.cos(a * 2.0 + i) * 0.2,
          pz + Math.cos(a) * 2.0
        );
        _dummy.scale.set(1, 1, c.length * (1 + audio.high * 0.9));
        _dummy.updateMatrix();
        this.cometInstanced.setMatrixAt(i, _dummy.matrix);
      }
      this.cometInstanced.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.geometries = [];
    this.materials = [];
  }
}
