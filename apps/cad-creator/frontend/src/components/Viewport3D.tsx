import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { DoorElement, FurnitureElement, ProjectState, WallElement, WindowElement, ParametricObject } from '@inneranimalmedia/agentsam-cad-shared';
import { 
  Camera, 
  Sun, 
  Moon, 
  Eye, 
  Maximize2, 
  RotateCcw, 
  Compass, 
  Layers, 
  Sparkles, 
  Video, 
  Download, 
  Footprints, 
  HelpCircle,
  Minimize2
} from 'lucide-react';

interface Props {
  project: ProjectState;
  onSnapshotTaken?: (dataUrl: string) => void;
  onTakeSnapshot?: (dataUrl: string) => void;
  onOpenVeoModal?: (snapshotUrl?: string) => void;
  onOpenImageGenModal?: (snapshotUrl?: string) => void;
}

const SCALE = 0.0254; // 1 inch = 0.0254 meters

export const Viewport3D: React.FC<Props> = ({
  project,
  onSnapshotTaken,
  onTakeSnapshot,
  onOpenVeoModal,
  onOpenImageGenModal,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Interaction & Camera states
  const [cameraMode, setCameraMode] = useState<'orbit' | 'firstperson' | 'topdown' | 'isometric'>('orbit');
  const [showRoof, setShowRoof] = useState(false);
  const [showDimensions3D, setShowDimensions3D] = useState(true);
  const [timeOfDay, setTimeOfDay] = useState<'morning' | 'noon' | 'sunset' | 'night'>(project.lighting.timeOfDay || 'noon');
  const [sunIntensity, setSunIntensity] = useState(project.lighting.intensity || 1.1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fpHelp, setFpHelp] = useState(true);

  // Orbit controls state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const orbitAngleRef = useRef({ theta: 0.8, phi: 0.7, radius: 18 });
  const targetRef = useRef<THREE.Vector3>(new THREE.Vector3(4, 1, 3.5));

  // First person controls state
  const fpPosRef = useRef<THREE.Vector3>(new THREE.Vector3(2, 1.6, 2));
  const fpPitchRef = useRef(0);
  const fpYawRef = useRef(0);
  const keysPressedRef = useRef<{ [key: string]: boolean }>({});

  // Dynamic materials cache
  const materialsRef = useRef<{ [key: string]: THREE.Material }>({});

  // Initialize Materials
  const getMaterial = useCallback((type: string, colorHex?: string): THREE.Material => {
    const key = `${type}_${colorHex || ''}`;
    if (materialsRef.current[key]) return materialsRef.current[key];

    let mat: THREE.Material;
    switch (type) {
      case 'brick':
        mat = new THREE.MeshStandardMaterial({
          color: colorHex ? new THREE.Color(colorHex) : new THREE.Color('#9a3412'),
          roughness: 0.85,
          metalness: 0.05,
        });
        break;
      case 'concrete':
        mat = new THREE.MeshStandardMaterial({
          color: colorHex ? new THREE.Color(colorHex) : new THREE.Color('#94a3b8'),
          roughness: 0.6,
          metalness: 0.1,
        });
        break;
      case 'wood_panel':
      case 'hardwood':
        mat = new THREE.MeshStandardMaterial({
          color: colorHex ? new THREE.Color(colorHex) : new THREE.Color('#b45309'),
          roughness: 0.45,
          metalness: 0.05,
        });
        break;
      case 'glass':
        mat = new THREE.MeshPhysicalMaterial({
          color: new THREE.Color('#bae6fd'),
          transparent: true,
          opacity: 0.35,
          roughness: 0.1,
          transmission: 0.8,
          thickness: 0.5,
        });
        break;
      case 'marble':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#f8fafc'),
          roughness: 0.2,
          metalness: 0.1,
        });
        break;
      case 'tile':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#e2e8f0'),
          roughness: 0.3,
          metalness: 0.05,
        });
        break;
      case 'polished_concrete':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#64748b'),
          roughness: 0.35,
          metalness: 0.2,
        });
        break;
      case 'steel':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#334155'),
          roughness: 0.3,
          metalness: 0.8,
        });
        break;
      case 'door_wood':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#78350f'),
          roughness: 0.4,
        });
        break;
      case 'window_frame':
        mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color('#0f172a'),
          roughness: 0.2,
          metalness: 0.7,
        });
        break;
      default:
        mat = new THREE.MeshStandardMaterial({
          color: colorHex ? new THREE.Color(colorHex) : new THREE.Color('#cbd5e1'),
          roughness: 0.6,
          metalness: 0.05,
        });
    }

    materialsRef.current[key] = mat;
    return mat;
  }, []);

  // Set up Three.js Scene and Render Loop
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.replaceChildren(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting setup
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#334155', 0.6);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight('#fffbeb', 1.2);
    dirLight.position.set(15, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 60;
    const d = 25;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // Ground plane with subtle architectural grid
    const groundSize = 60;
    const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize);
    const groundMat = new THREE.MeshStandardMaterial({
      color: '#0b101b',
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(50, 50, '#1e293b', '#0f172a');
    gridHelper.position.y = 0;
    scene.add(gridHelper);

    // Animation / Render loop
    let lastTime = performance.now();
    const animate = (currentTime: number) => {
      const delta = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      // Handle First-Person keyboard navigation
      if (cameraMode === 'firstperson' && cameraRef.current) {
        const isSprint = keysPressedRef.current['ShiftLeft'] || keysPressedRef.current['ShiftRight'];
        const baseSpeed = isSprint ? 8.0 : 4.0;
        const moveSpeed = baseSpeed * delta;

        const forward = new THREE.Vector3(
          Math.sin(fpYawRef.current),
          0,
          Math.cos(fpYawRef.current)
        ).normalize();
        const right = new THREE.Vector3(
          Math.cos(fpYawRef.current),
          0,
          -Math.sin(fpYawRef.current)
        ).normalize();

        if (keysPressedRef.current['KeyW'] || keysPressedRef.current['ArrowUp']) {
          fpPosRef.current.addScaledVector(forward, -moveSpeed);
        }
        if (keysPressedRef.current['KeyS'] || keysPressedRef.current['ArrowDown']) {
          fpPosRef.current.addScaledVector(forward, moveSpeed);
        }
        if (keysPressedRef.current['KeyA'] || keysPressedRef.current['ArrowLeft']) {
          fpPosRef.current.addScaledVector(right, -moveSpeed);
        }
        if (keysPressedRef.current['KeyD'] || keysPressedRef.current['ArrowRight']) {
          fpPosRef.current.addScaledVector(right, moveSpeed);
        }
        if (keysPressedRef.current['Space'] || keysPressedRef.current['KeyQ']) {
          fpPosRef.current.y += moveSpeed;
        }
        if (keysPressedRef.current['KeyC'] || keysPressedRef.current['KeyE']) {
          fpPosRef.current.y = Math.max(0.4, fpPosRef.current.y - moveSpeed);
        }

        cameraRef.current.position.copy(fpPosRef.current);
        cameraRef.current.rotation.order = 'YXZ';
        cameraRef.current.rotation.y = fpYawRef.current;
        cameraRef.current.rotation.x = fpPitchRef.current;
        cameraRef.current.rotation.z = 0;
      } else if (cameraRef.current) {
        // Orbit / Top-Down / Isometric update
        if (cameraMode === 'orbit') {
          const { theta, phi, radius } = orbitAngleRef.current;
          const x = targetRef.current.x + radius * Math.sin(phi) * Math.sin(theta);
          const y = targetRef.current.y + radius * Math.cos(phi);
          const z = targetRef.current.z + radius * Math.sin(phi) * Math.cos(theta);
          cameraRef.current.position.set(x, y, z);
          cameraRef.current.lookAt(targetRef.current);
        } else if (cameraMode === 'topdown') {
          cameraRef.current.position.set(targetRef.current.x, 18, targetRef.current.z + 0.001);
          cameraRef.current.lookAt(targetRef.current);
        } else if (cameraMode === 'isometric') {
          cameraRef.current.position.set(targetRef.current.x + 12, 14, targetRef.current.z + 12);
          cameraRef.current.lookAt(targetRef.current);
        }
      }

      renderer.render(scene, cameraRef.current!);
      animFrameIdRef.current = requestAnimationFrame(animate);
    };
    animFrameIdRef.current = requestAnimationFrame(animate);

    // Resize observer
    const handleResize = () => {
      if (!container || !cameraRef.current || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Keyboard handlers
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current[e.code] = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.dispose();
    };
  }, [cameraMode]);

  // Adjust Lighting depending on Time of Day & sunIntensity
  useEffect(() => {
    if (!dirLightRef.current || !hemiLightRef.current || !sceneRef.current) return;

    let skyColor = '#090d16';
    let dirColor = '#fffbeb';
    let dirPos = new THREE.Vector3(15, 20, 10);
    let intensity = sunIntensity;

    switch (timeOfDay) {
      case 'morning':
        skyColor = '#1e293b';
        dirColor = '#ffedd5';
        dirPos.set(25, 12, 20);
        hemiLightRef.current.intensity = 0.7;
        break;
      case 'noon':
        skyColor = '#0f172a';
        dirColor = '#ffffff';
        dirPos.set(5, 28, 5);
        hemiLightRef.current.intensity = 0.9;
        break;
      case 'sunset':
        skyColor = '#31101f';
        dirColor = '#fb923c';
        dirPos.set(-20, 6, -15);
        intensity = sunIntensity * 1.3;
        hemiLightRef.current.intensity = 0.5;
        break;
      case 'night':
        skyColor = '#020617';
        dirColor = '#38bdf8';
        dirPos.set(10, 15, 10);
        intensity = 0.3;
        hemiLightRef.current.intensity = 0.2;
        break;
    }

    sceneRef.current.background = new THREE.Color(skyColor);
    dirLightRef.current.color.set(dirColor);
    dirLightRef.current.position.copy(dirPos);
    dirLightRef.current.intensity = intensity;
  }, [timeOfDay, sunIntensity]);

  // Build / Reconstruct 3D BIM Elements in Scene
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Clear previous BIM elements
    const toRemove: THREE.Object3D[] = [];
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.isBIMElement) {
        toRemove.push(obj);
      }
    });
    toRemove.forEach((obj) => scene.remove(obj));

    const bimRoot = new THREE.Group();
    bimRoot.userData = { isBIMElement: true };

    // 1. Render Room Floors
    project.rooms.forEach((rm) => {
      if (rm.points.length >= 3) {
        const shape = new THREE.Shape();
        rm.points.forEach((p, i) => {
          const x = p[0] * SCALE;
          const z = p[1] * SCALE;
          if (i === 0) shape.moveTo(x, z);
          else shape.lineTo(x, z);
        });
        shape.closePath();

        const geo = new THREE.ShapeGeometry(shape);
        const mat = getMaterial(rm.floorMaterial || 'hardwood');
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = 0.01;
        mesh.receiveShadow = true;
        bimRoot.add(mesh);
      }
    });

    // 2. Render Walls with Window & Door Cutouts
    project.walls.forEach((wall) => {
      const dx = (wall.x2 - wall.x1) * SCALE;
      const dz = (wall.y2 - wall.y1) * SCALE;
      const wallLen = Math.hypot(dx, dz);
      if (wallLen === 0) return;

      const angle = Math.atan2(dz, dx);
      const thickness = (wall.thickness || 6) * SCALE;
      const height = (wall.height3D || project.ceilingHeight || 96) * SCALE;

      // Find doors and windows attached to this wall
      const wallDoors = project.doors.filter((d) => d.wallId === wall.id);
      const wallWindows = project.windows.filter((w) => w.wallId === wall.id);

      const wallMat = getMaterial(wall.material, wall.color);

      // If no doors/windows, build solid wall
      if (wallDoors.length === 0 && wallWindows.length === 0) {
        const wallGeo = new THREE.BoxGeometry(wallLen, height, thickness);
        const wallMesh = new THREE.Mesh(wallGeo, wallMat);
        wallMesh.position.set(
          (wall.x1 * SCALE + wall.x2 * SCALE) / 2,
          height / 2,
          (wall.y1 * SCALE + wall.y2 * SCALE) / 2
        );
        wallMesh.rotation.y = -angle;
        wallMesh.castShadow = true;
        wallMesh.receiveShadow = true;
        bimRoot.add(wallMesh);
      } else {
        // Parametric segmented wall with cutouts
        const segments: { start: number; end: number; type: 'wall' | 'door' | 'window'; item?: any }[] = [];
        const openings: { pos: number; width: number; type: 'door' | 'window'; item: any }[] = [];

        wallDoors.forEach((d) => {
          const w = (d.width * SCALE);
          const center = d.distanceAlongWall * wallLen;
          openings.push({ pos: center, width: w, type: 'door', item: d });
        });

        wallWindows.forEach((w) => {
          const width = (w.width * SCALE);
          const center = w.distanceAlongWall * wallLen;
          openings.push({ pos: center, width, type: 'window', item: w });
        });

        openings.sort((a, b) => a.pos - b.pos);

        let cur = 0;
        openings.forEach((op) => {
          const start = Math.max(0, op.pos - op.width / 2);
          const end = Math.min(wallLen, op.pos + op.width / 2);
          if (start > cur) {
            segments.push({ start: cur, end: start, type: 'wall' });
          }
          segments.push({ start, end, type: op.type, item: op.item });
          cur = end;
        });
        if (cur < wallLen) {
          segments.push({ start: cur, end: wallLen, type: 'wall' });
        }

        // Generate geometry segments along the wall direction
        const ux = Math.cos(angle);
        const uz = Math.sin(angle);
        const startX = wall.x1 * SCALE;
        const startZ = wall.y1 * SCALE;

        segments.forEach((seg) => {
          const segLen = seg.end - seg.start;
          if (segLen <= 0.001) return;
          const segMid = (seg.start + seg.end) / 2;
          const posX = startX + ux * segMid;
          const posZ = startZ + uz * segMid;

          if (seg.type === 'wall') {
            const segGeo = new THREE.BoxGeometry(segLen, height, thickness);
            const segMesh = new THREE.Mesh(segGeo, wallMat);
            segMesh.position.set(posX, height / 2, posZ);
            segMesh.rotation.y = -angle;
            segMesh.castShadow = true;
            segMesh.receiveShadow = true;
            bimRoot.add(segMesh);
          } else if (seg.type === 'door') {
            const doorItem: DoorElement = seg.item;
            const doorHeight = (doorItem.height || 84) * SCALE;
            const headerHeight = height - doorHeight;

            // Header wall segment above door
            if (headerHeight > 0.05) {
              const headerGeo = new THREE.BoxGeometry(segLen, headerHeight, thickness);
              const headerMesh = new THREE.Mesh(headerGeo, wallMat);
              headerMesh.position.set(posX, doorHeight + headerHeight / 2, posZ);
              headerMesh.rotation.y = -angle;
              headerMesh.castShadow = true;
              bimRoot.add(headerMesh);
            }

            // 3D Door Frame & Leaf
            const doorGroup = new THREE.Group();
            doorGroup.position.set(posX, 0, posZ);
            doorGroup.rotation.y = -angle;

            // Frame
            const frameMat = getMaterial('window_frame');
            const frameThick = 0.04;
            const leftFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, thickness), frameMat);
            leftFrame.position.set(-segLen / 2 + frameThick / 2, doorHeight / 2, 0);
            const rightFrame = new THREE.Mesh(new THREE.BoxGeometry(frameThick, doorHeight, thickness), frameMat);
            rightFrame.position.set(segLen / 2 - frameThick / 2, doorHeight / 2, 0);
            doorGroup.add(leftFrame, rightFrame);

            // Door Leaf (angled swing)
            const leafWidth = segLen - frameThick * 2;
            const leafGeo = new THREE.BoxGeometry(leafWidth, doorHeight - 0.02, 0.04);
            const leafMat = getMaterial('door_wood');
            const leafMesh = new THREE.Mesh(leafGeo, leafMat);
            const swingRad = ((doorItem.openAngle || 30) * Math.PI) / 180;
            leafMesh.position.set(-leafWidth / 2 + (frameThick), (doorHeight - 0.02) / 2, 0);
            leafMesh.rotation.y = swingRad;
            leafMesh.castShadow = true;
            doorGroup.add(leafMesh);

            bimRoot.add(doorGroup);
          } else if (seg.type === 'window') {
            const winItem: WindowElement = seg.item;
            const elevation = (winItem.elevation || 36) * SCALE;
            const winH = (winItem.height || 48) * SCALE;
            const topHeader = height - (elevation + winH);

            // Wall below sill
            if (elevation > 0.05) {
              const sillGeo = new THREE.BoxGeometry(segLen, elevation, thickness);
              const sillMesh = new THREE.Mesh(sillGeo, wallMat);
              sillMesh.position.set(posX, elevation / 2, posZ);
              sillMesh.rotation.y = -angle;
              sillMesh.castShadow = true;
              bimRoot.add(sillMesh);
            }
            // Wall above window
            if (topHeader > 0.05) {
              const topGeo = new THREE.BoxGeometry(segLen, topHeader, thickness);
              const topMesh = new THREE.Mesh(topGeo, wallMat);
              topMesh.position.set(posX, elevation + winH + topHeader / 2, posZ);
              topMesh.rotation.y = -angle;
              topMesh.castShadow = true;
              bimRoot.add(topMesh);
            }

            // Window Frame & Glass
            const winGroup = new THREE.Group();
            winGroup.position.set(posX, elevation + winH / 2, posZ);
            winGroup.rotation.y = -angle;

            const frameMat = getMaterial('window_frame');
            const glassMat = getMaterial('glass');

            const glass = new THREE.Mesh(new THREE.BoxGeometry(segLen - 0.06, winH - 0.06, 0.02), glassMat);
            const frame = new THREE.Mesh(new THREE.BoxGeometry(segLen, winH, thickness * 0.8), frameMat);
            frame.castShadow = true;
            winGroup.add(glass, frame);

            bimRoot.add(winGroup);
          }
        });
      }
    });

    // 3. Render 3D Parametric Furniture & Fixtures
    project.furniture.forEach((item) => {
      const fGroup = create3DFurnitureMesh(item, getMaterial);
      bimRoot.add(fGroup);
    });

    // 3b. Render Parametric Assemblies (OpenSCAD / Procedural CSG objects)
    (project.parametricObjects || []).forEach((pObj) => {
      const pGroup = createParametricObjectMesh(pObj, getMaterial);
      bimRoot.add(pGroup);
    });

    // 4. Roof / Ceiling (if toggled)
    if (showRoof && project.rooms.length > 0) {
      project.rooms.forEach((rm) => {
        if (rm.points.length >= 3) {
          const shape = new THREE.Shape();
          rm.points.forEach((p, i) => {
            const x = p[0] * SCALE;
            const z = p[1] * SCALE;
            if (i === 0) shape.moveTo(x, z);
            else shape.lineTo(x, z);
          });
          shape.closePath();

          const geo = new THREE.ShapeGeometry(shape);
          const mat = new THREE.MeshStandardMaterial({
            color: '#334155',
            roughness: 0.8,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.rotation.x = Math.PI / 2;
          mesh.position.y = (project.ceilingHeight || 96) * SCALE;
          mesh.castShadow = true;
          bimRoot.add(mesh);
        }
      });
    }

    scene.add(bimRoot);

    // Calculate center point of all walls to position camera target
    if (project.walls.length > 0) {
      let sumX = 0, sumZ = 0, count = 0;
      project.walls.forEach((w) => {
        sumX += (w.x1 + w.x2) * SCALE;
        sumZ += (w.y1 + w.y2) * SCALE;
        count += 2;
      });
      targetRef.current.set(sumX / count, 1.2, sumZ / count);
    }
  }, [project, showRoof, getMaterial]);

  // Mouse drag & zoom handlers for orbit & firstperson
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    if (cameraMode === 'firstperson') {
      fpYawRef.current -= deltaX * 0.005;
      fpPitchRef.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, fpPitchRef.current - deltaY * 0.005));
    } else {
      orbitAngleRef.current.theta += deltaX * 0.01;
      orbitAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2.05, orbitAngleRef.current.phi - deltaY * 0.01));
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (cameraMode === 'orbit') {
      orbitAngleRef.current.radius = Math.max(3, Math.min(60, orbitAngleRef.current.radius + e.deltaY * 0.02));
    }
  };

  // High-Resolution Snapshot trigger
  const takeSnapshot = () => {
    if (!rendererRef.current) return;
    const dataUrl = rendererRef.current.domElement.toDataURL('image/png');
    if (onSnapshotTaken) onSnapshotTaken(dataUrl);
    if (onTakeSnapshot) onTakeSnapshot(dataUrl);
    return dataUrl;
  };

  return (
    <div className="w-full h-full relative bg-[#121212] flex flex-col select-none overflow-hidden group">
      {/* 3D Viewport Header Bar */}
      <div className="absolute top-2.5 left-2.5 right-2.5 z-10 flex items-center justify-between pointer-events-none">
        <div className="flex items-center space-x-1 bg-[#252525] border border-[#333] p-1 rounded shadow-lg pointer-events-auto">
          <button
            onClick={() => setCameraMode('orbit')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center space-x-1.5 transition ${
              cameraMode === 'orbit'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[#333]'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Orbit 3D</span>
          </button>
          <button
            onClick={() => {
              setCameraMode('firstperson');
              if (cameraRef.current) fpPosRef.current.set(targetRef.current.x, 1.65, targetRef.current.z);
            }}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center space-x-1.5 transition ${
              cameraMode === 'firstperson'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[#333]'
            }`}
          >
            <Footprints className="w-3.5 h-3.5" />
            <span>Walkthrough</span>
          </button>
          <button
            onClick={() => setCameraMode('topdown')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center space-x-1.5 transition ${
              cameraMode === 'topdown'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[#333]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Top 3D</span>
          </button>
          <button
            onClick={() => setCameraMode('isometric')}
            className={`px-2.5 py-1 text-xs font-medium rounded flex items-center space-x-1.5 transition ${
              cameraMode === 'isometric'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[#333]'
            }`}
          >
            <span>Isometric</span>
          </button>
        </div>

        {/* Time of Day & Lighting Control */}
        <div className="flex items-center space-x-1.5 bg-[#252525] border border-[#333] p-1 rounded shadow-lg pointer-events-auto">
          <div className="flex bg-[#1E1E1E] p-0.5 rounded border border-[#333]">
            {(['morning', 'noon', 'sunset', 'night'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTimeOfDay(t)}
                className={`px-2 py-0.5 text-[11px] rounded capitalize transition ${
                  timeOfDay === t
                    ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowRoof((prev) => !prev)}
            className={`px-2 py-1 text-xs rounded border transition ${
              showRoof
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 font-medium'
                : 'bg-[#1E1E1E] text-gray-400 border-[#333] hover:text-white'
            }`}
          >
            Roof {showRoof ? 'ON' : 'OFF'}
          </button>

          {/* Snapshot to AI Actions */}
          <button
            onClick={() => {
              const url = takeSnapshot();
              if (onOpenImageGenModal && url) onOpenImageGenModal(url);
            }}
            title="Render with Gemini Image Studio"
            className="p-1.5 rounded bg-[#1E1E1E] hover:bg-[#333] text-blue-300 border border-blue-500/40 transition flex items-center space-x-1 text-xs font-medium"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Render</span>
          </button>

          <button
            onClick={() => {
              const url = takeSnapshot();
              if (onOpenVeoModal && url) onOpenVeoModal(url);
            }}
            title="Animate to Video with Veo"
            className="p-1.5 rounded bg-[#1E1E1E] hover:bg-[#333] text-emerald-300 border border-emerald-500/40 transition flex items-center space-x-1 text-xs font-medium"
          >
            <Video className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Veo</span>
          </button>
        </div>
      </div>

      {/* Main 3D Canvas Mounting Container */}
      <div
        ref={mountRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing relative"
      />

      {/* First Person Crosshair and Navigation HUD */}
      {cameraMode === 'firstperson' && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white/70 shadow-glow"></div>

          {fpHelp && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-[#252525] border border-[#333] px-3.5 py-1.5 rounded text-xs text-gray-300 flex items-center space-x-3 pointer-events-auto shadow-xl">
              <span>Use <kbd className="px-1.5 py-0.5 bg-[#1E1E1E] border border-[#333] rounded font-mono text-white text-[10px]">W</kbd><kbd className="px-1.5 py-0.5 bg-[#1E1E1E] border border-[#333] rounded font-mono text-white text-[10px]">A</kbd><kbd className="px-1.5 py-0.5 bg-[#1E1E1E] border border-[#333] rounded font-mono text-white text-[10px]">S</kbd><kbd className="px-1.5 py-0.5 bg-[#1E1E1E] border border-[#333] rounded font-mono text-white text-[10px]">D</kbd> or Arrows to walk</span>
              <span className="text-gray-600">|</span>
              <span>Click & Drag to Look</span>
              <button onClick={() => setFpHelp(false)} className="text-gray-400 hover:text-white text-xs ml-2">✕</button>
            </div>
          )}
        </div>
      )}

      {/* Bottom Status Bar */}
      <div className="absolute bottom-2.5 right-2.5 z-10 pointer-events-none flex items-center space-x-2">
        <div className="bg-[#252525] border border-[#333] px-2.5 py-1 rounded text-[11px] text-gray-400 flex items-center space-x-2 shadow font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
          <span>{project.walls.length} Walls</span>
          <span>•</span>
          <span>{project.doors.length + project.windows.length} Openings</span>
          <span>•</span>
          <span>{project.furniture.length} Fixtures</span>
        </div>
      </div>
    </div>
  );
};

// Helper: Procedural 3D Furniture Meshes (Sofas, Beds, Tables, Kitchen, Baths, Plants)
function create3DFurnitureMesh(
  item: FurnitureElement,
  getMaterial: (type: string, color?: string) => THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(item.x * SCALE, 0, item.y * SCALE);
  group.rotation.y = -((item.rotation || 0) * Math.PI) / 180;

  const w = (item.w || 36) * SCALE;
  const d = (item.d || 36) * SCALE;
  const h = (item.h || 30) * SCALE;

  const mainMat = getMaterial('furniture', item.color || '#334155');
  const woodMat = getMaterial('wood_panel');
  const metalMat = getMaterial('steel');

  if (item.type.includes('sofa') || item.category === 'seating') {
    // 3D Modern Sofa (base, seat cushions, backrest, armrests)
    const baseH = h * 0.45;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), mainMat);
    base.position.y = baseH / 2;
    base.castShadow = true;
    base.receiveShadow = true;

    // Backrest
    const backH = h * 0.55;
    const backD = d * 0.25;
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, backH, backD), mainMat);
    back.position.set(0, baseH + backH / 2, -d / 2 + backD / 2);
    back.castShadow = true;

    // Armrests
    const armW = w * 0.12;
    const armH = h * 0.35;
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, d), mainMat);
    leftArm.position.set(-w / 2 + armW / 2, baseH + armH / 2, 0);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, d), mainMat);
    rightArm.position.set(w / 2 - armW / 2, baseH + armH / 2, 0);

    group.add(base, back, leftArm, rightArm);
  } else if (item.type.includes('bed') || item.category === 'bedroom') {
    // 3D Platform Bed (frame, mattress, pillows, headboard)
    const frameH = h * 0.3;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, frameH, d), woodMat);
    frame.position.y = frameH / 2;
    frame.castShadow = true;

    // Mattress
    const mattH = h * 0.35;
    const mattMat = getMaterial('fabric', '#f8fafc');
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(w * 0.95, mattH, d * 0.92), mattMat);
    mattress.position.set(0, frameH + mattH / 2, d * 0.02);
    mattress.castShadow = true;

    // Headboard
    const headH = h;
    const headD = d * 0.08;
    const head = new THREE.Mesh(new THREE.BoxGeometry(w, headH, headD), woodMat);
    head.position.set(0, headH / 2, -d / 2 + headD / 2);
    head.castShadow = true;

    group.add(frame, mattress, head);
  } else if (item.type.includes('table') || item.type.includes('desk') || item.category === 'tables') {
    // 3D Table / Desk with 4 legs
    const topH = 0.04;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, topH, d), woodMat);
    top.position.y = h - topH / 2;
    top.castShadow = true;
    top.receiveShadow = true;

    const legThick = 0.04;
    const legGeo = new THREE.BoxGeometry(legThick, h - topH, legThick);
    const leg1 = new THREE.Mesh(legGeo, metalMat);
    leg1.position.set(-w / 2 + legThick, (h - topH) / 2, -d / 2 + legThick);
    const leg2 = new THREE.Mesh(legGeo, metalMat);
    leg2.position.set(w / 2 - legThick, (h - topH) / 2, -d / 2 + legThick);
    const leg3 = new THREE.Mesh(legGeo, metalMat);
    leg3.position.set(-w / 2 + legThick, (h - topH) / 2, d / 2 - legThick);
    const leg4 = new THREE.Mesh(legGeo, metalMat);
    leg4.position.set(w / 2 - legThick, (h - topH) / 2, d / 2 - legThick);

    group.add(top, leg1, leg2, leg3, leg4);
  } else if (item.type.includes('island') || item.category === 'kitchen') {
    // 3D Kitchen Island / Counter with marble top
    const baseH = h * 0.9;
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), mainMat);
    base.position.y = baseH / 2;
    base.castShadow = true;

    const marbleTop = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h * 0.1, d * 1.05), getMaterial('marble'));
    marbleTop.position.y = baseH + (h * 0.1) / 2;
    marbleTop.castShadow = true;

    group.add(base, marbleTop);
  } else if (item.type.includes('bathtub') || item.type.includes('tub')) {
    // 3D Freestanding Soaking Tub
    const tubGeo = new THREE.CylinderGeometry(w / 2, w / 2.3, h, 24);
    const tubMat = getMaterial('marble', '#ffffff');
    const tub = new THREE.Mesh(tubGeo, tubMat);
    tub.position.y = h / 2;
    tub.scale.set(1, 1, d / w);
    tub.castShadow = true;
    group.add(tub);
  } else if (item.type.includes('plant')) {
    // 3D Potted Plant
    const potH = h * 0.35;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.4, w * 0.3, potH, 16), getMaterial('terracotta', '#ea580c'));
    pot.position.y = potH / 2;
    pot.castShadow = true;

    const foliage = new THREE.Mesh(new THREE.SphereGeometry(w * 0.45, 12, 12), getMaterial('foliage', '#15803d'));
    foliage.position.y = potH + (h * 0.4);
    foliage.castShadow = true;

    group.add(pot, foliage);
  } else {
    // Generic Architectural Cuboid
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mainMat);
    box.position.y = h / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }

  return group;
}

function createParametricObjectMesh(
  item: ParametricObject,
  getMaterial: (type: string, color?: string) => THREE.Material
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(item.transform.x * SCALE, (item.transform.z || 0) * SCALE, item.transform.y * SCALE);
  group.rotation.y = -((item.transform.rotationY || 0) * Math.PI) / 180;

  const w = (Number(item.parameters.deskWidth || item.parameters.unitWidth || item.parameters.postSpanX || 48)) * SCALE;
  const d = (Number(item.parameters.deskDepth || item.parameters.unitDepth || item.parameters.postSpanY || 24)) * SCALE;
  const h = (Number(item.parameters.deskHeight || item.parameters.unitHeight || item.parameters.totalHeight || 30)) * SCALE;

  const woodMat = getMaterial('wood_panel', '#d97706');
  const metalMat = getMaterial('steel', '#475569');
  const accentMat = getMaterial('accent', '#a855f7');

  if (item.generatorTemplate === 'workstation' || item.name.toLowerCase().includes('desk')) {
    // Desktop slab
    const topH = 0.035;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, topH, d), woodMat);
    top.position.y = h - topH / 2;
    top.castShadow = true;
    top.receiveShadow = true;

    // 4 legs
    const legThick = 0.045;
    const legGeo = new THREE.BoxGeometry(legThick, h - topH, legThick);
    const leg1 = new THREE.Mesh(legGeo, metalMat);
    leg1.position.set(-w / 2 + legThick, (h - topH) / 2, -d / 2 + legThick);
    const leg2 = new THREE.Mesh(legGeo, metalMat);
    leg2.position.set(w / 2 - legThick, (h - topH) / 2, -d / 2 + legThick);
    const leg3 = new THREE.Mesh(legGeo, metalMat);
    leg3.position.set(-w / 2 + legThick, (h - topH) / 2, d / 2 - legThick);
    const leg4 = new THREE.Mesh(legGeo, metalMat);
    leg4.position.set(w / 2 - legThick, (h - topH) / 2, d / 2 - legThick);

    // Modesty Panel
    const modH = h * 0.45;
    const mod = new THREE.Mesh(new THREE.BoxGeometry(w * 0.85, modH, 0.02), metalMat);
    mod.position.set(0, h - topH - modH / 2, -d / 2 + 0.04);
    mod.castShadow = true;

    group.add(top, leg1, leg2, leg3, leg4, mod);
  } else if (item.generatorTemplate === 'bookshelf' || item.name.toLowerCase().includes('shelf')) {
    // Bookshelf Frame
    const t = 0.02;
    const left = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), woodMat);
    left.position.set(-w / 2 + t / 2, h / 2, 0);
    const right = new THREE.Mesh(new THREE.BoxGeometry(t, h, d), woodMat);
    right.position.set(w / 2 - t / 2, h / 2, 0);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), woodMat);
    bottom.position.set(0, t / 2, 0);
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, t, d), woodMat);
    top.position.set(0, h - t / 2, 0);

    group.add(left, right, bottom, top);

    const numShelves = Number(item.parameters.numShelves || 4);
    const shelfSpacing = (h - 2 * t) / (numShelves + 1);
    for (let s = 1; s <= numShelves; s++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * t, t, d), woodMat);
      shelf.position.set(0, s * shelfSpacing, 0);
      shelf.castShadow = true;
      group.add(shelf);
    }
  } else if (item.generatorTemplate === 'pergola' || item.name.toLowerCase().includes('pergola')) {
    const postSize = 0.12;
    const postGeo = new THREE.BoxGeometry(postSize, h, postSize);
    const p1 = new THREE.Mesh(postGeo, woodMat);
    p1.position.set(-w / 2, h / 2, -d / 2);
    const p2 = new THREE.Mesh(postGeo, woodMat);
    p2.position.set(w / 2, h / 2, -d / 2);
    const p3 = new THREE.Mesh(postGeo, woodMat);
    p3.position.set(-w / 2, h / 2, d / 2);
    const p4 = new THREE.Mesh(postGeo, woodMat);
    p4.position.set(w / 2, h / 2, d / 2);

    const beamGeo = new THREE.BoxGeometry(w + 0.4, 0.2, 0.08);
    const b1 = new THREE.Mesh(beamGeo, woodMat);
    b1.position.set(0, h + 0.1, -d / 2);
    const b2 = new THREE.Mesh(beamGeo, woodMat);
    b2.position.set(0, h + 0.1, d / 2);

    group.add(p1, p2, p3, p4, b1, b2);
  } else {
    // Custom Parametric Bounding Box with Purple Architectural Accent
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), accentMat);
    box.position.y = h / 2;
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
  }

  return group;
}
