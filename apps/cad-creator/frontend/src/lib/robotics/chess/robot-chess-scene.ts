/** An interactive chess surface in the EXISTING MuJoCo/Three viewport.
 * Chess pieces are a visual layer, not MuJoCo collision bodies. Grasp isn't verified.
 */
import { Chess, type Square, type Move } from 'chess.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as THREE from 'three';
import { SQUARE_M, ornatePieceUrl } from './frankaChessScene';
import type { SimulationProvider } from '../simulation/provider';

const BLACK_EDGE_Y = 0.18;
const BOARD_CENTER_Y = BLACK_EDGE_Y + 3.5 * SQUARE_M;
const PIECE_BASE_Z = 0.0375;
const BAROQUE_KINDS: Record<string,string> = {p:'pawn',n:'knight',b:'bishop',r:'rook',q:'queen',k:'king'};
const BAROQUE_TYPES = ['p','n','b','r','q','k'] as const;
type SquareClick = (square: Square) => void;

export function chessSquarePosition(square: string, z = 0) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return new THREE.Vector3((file - 3.5) * SQUARE_M, BLACK_EDGE_Y + (8-rank) * SQUARE_M, z);
}

export class RobotChessScene {
  private readonly group = new THREE.Group();
  private readonly tiles = new Map<string, THREE.Mesh>();
  private readonly pieceLayer = new THREE.Group();
  private readonly baroqueTemplates = new Map<string, THREE.Group>();
  private baroqueReady = false;
  private readonly cameraPosition: THREE.Vector3;
  private readonly cameraTarget: THREE.Vector3;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: { target: THREE.Vector3; update: () => void };
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly onSquare: SquareClick;
  private down: { x: number; y: number } | null = null;
  private disposed = false;
  private readonly provider: SimulationProvider;

  constructor(provider: SimulationProvider, onSquare: SquareClick) {
    const raw = provider.getRawSim();
    if (!raw) throw new Error('robot_chess_simulation_not_ready');
    this.provider = provider;
    this.onSquare = onSquare;
    this.renderer = raw.renderSys.renderer;
    this.camera = raw.renderSys.camera;
    this.controls = raw.renderSys.controls;
    this.cameraPosition = this.camera.position.clone();
    this.cameraTarget = this.controls.target.clone();
    this.group.name = 'agentsam-franka-chess';
    raw.renderSys.scene.add(this.group);

    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(SQUARE_M * 8 + 0.035, SQUARE_M * 8 + 0.035, 0.028),
      new THREE.MeshStandardMaterial({ color: 0x222733, roughness: 0.72, metalness: 0.22 })
    );
    foundation.position.set(0, BOARD_CENTER_Y, 0.018);
    foundation.receiveShadow = true;
    this.group.add(foundation);

    for (let rank = 1; rank <= 8; rank++) for (let file = 0; file < 8; file++) {
      const square = String.fromCharCode(97 + file) + rank;
      const pale = (rank + file) % 2 === 0;
      const tile = new THREE.Mesh(
        new THREE.BoxGeometry(SQUARE_M * 0.99, SQUARE_M * 0.99, 0.003),
        new THREE.MeshStandardMaterial({ color: pale ? 0xbac1bc : 0x303a4a, roughness: 0.77 })
      );
      tile.position.copy(chessSquarePosition(square, 0.034));
      tile.receiveShadow = true;
      tile.userData.square = square;
      this.group.add(tile);
      this.tiles.set(square, tile);
    }
    this.group.add(this.pieceLayer);

    // The player looks across the board toward the arm; no second Three.js canvas.
    this.camera.position.set(0.82, 1.12, 0.85);
    this.controls.target.set(0, 0.31, 0.15);
    this.controls.update();
    this.renderer.domElement.addEventListener('pointerdown', this.onDown);
    this.renderer.domElement.addEventListener('pointerup', this.onUp);
  }

  private readonly onDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  private readonly onUp = (event: PointerEvent) => {
    if (this.disposed || !this.down || Math.hypot(event.clientX-this.down.x, event.clientY-this.down.y) > 7) return;
    this.down = null;
    const bounds = this.renderer.domElement.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.pointer.set(((event.clientX - bounds.left) / bounds.width)*2-1, -((event.clientY - bounds.top) / bounds.height)*2+1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    // Chess input must resolve the BOARD square, not whichever tall GLB crown
    // is first along the ray. Model geometry overlaps neighboring screen pixels
    // in perspective; selecting its nearest triangle can choose a wrong square.
    const hits = this.raycaster.intersectObjects([...this.tiles.values()], false);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.square) object = object.parent;
      if (object?.userData.square) {
        this.onSquare(object.userData.square as Square);
        return;
      }
    }
  };

  /** Reuses the canonical public MeauxChess GLBs. Source meshes are cached once,
   * scaled to the metric MuJoCo board and rotated from GLTF Y-up to physics Z-up.
   * A failed download stays explicit in the caller's retry UI.
   */
  async loadBaroquePieces(onProgress?: (done: number, total: number) => void): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const variants = BAROQUE_TYPES.flatMap(type =>
      (['w','b'] as const).map(color => ({ type, color, key: type + color }))
    );
    let completed = 0;
    for (const variant of variants) {
      if (this.disposed) return;
      if (this.baroqueTemplates.has(variant.key)) {
        onProgress?.(++completed, variants.length);
        continue;
      }
      const model = await loader.loadAsync(ornatePieceUrl(BAROQUE_KINDS[variant.type], variant.color === 'w' ? 'white' : 'black'));
      if (this.disposed) {
        model.scene.traverse(object => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach(material => material.dispose());
          }
        });
        return;
      }
      const bounds = new THREE.Box3().setFromObject(model.scene);
      const size = bounds.getSize(new THREE.Vector3());
      if (bounds.isEmpty() || !(size.y > 0) || !(Math.max(size.x,size.z) > 0)) {
        throw new Error('baroque_invalid_model_bounds:' + variant.key);
      }
      const scale = Math.min(SQUARE_M * 0.8 / Math.max(size.x, size.z), SQUARE_M * 2.0 / size.y);
      const center = bounds.getCenter(new THREE.Vector3());
      model.scene.position.set(-center.x, -bounds.min.y, -center.z);
      const oriented = new THREE.Group();
      oriented.rotation.x = Math.PI / 2;
      oriented.scale.setScalar(scale);
      oriented.add(model.scene);
      oriented.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.baroqueTemplates.set(variant.key, oriented);
      onProgress?.(++completed, variants.length);
    }
    if (this.disposed) return;
    this.baroqueReady = true;
  }

  private clearPieceLayer() {
    while (this.pieceLayer.children.length) {
      const child = this.pieceLayer.children[0];
      this.pieceLayer.remove(child);
      if (child.userData.baroque) continue; // cached GLB geometries/materials belong to templates
      child.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
    }
  }

  /** Display authoritative chess.js state, never a second mutable chess board. */
  draw(game: Chess, selected: Square | null, targets: readonly Square[]) {
    if (this.disposed) return;
    for (const [square, tile] of this.tiles) {
      const material = tile.material as THREE.MeshStandardMaterial;
      const file = square.charCodeAt(0)-97;
      const rank = Number(square[1]);
      material.color.setHex(square === selected ? 0x8070b3 : targets.includes(square as Square) ? 0x627c75 : ((rank + file)%2 === 0 ? 0xbac1bc : 0x303a4a));
    }
    this.clearPieceLayer();
    for (const row of game.board()) for (const piece of row) {
      if (!piece) continue;
      const template = this.baroqueReady ? this.baroqueTemplates.get(piece.type + piece.color) : undefined;
      const shape = template ? template.clone(true) : this.buildPiece(piece.type, piece.color);
      shape.userData.baroque = Boolean(template);
      shape.position.copy(chessSquarePosition(piece.square, PIECE_BASE_Z));
      shape.userData.square = piece.square;
      this.pieceLayer.add(shape);
    }
  }

  private buildPiece(type: string, color: string) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0xebe4d7 : 0x222631, roughness: 0.28, metalness: 0.24
    });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.38, metalness: 0.74 });
    const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, height: number) => {
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.position.z = height;
      mesh.castShadow = true;
      group.add(mesh);
    };
    add(new THREE.CylinderGeometry(0.017, 0.020, 0.006, 20), gold, 0);
    add(new THREE.CylinderGeometry(0.012, 0.016, 0.009, 16), material, 0.007);
    const stature: Record<string, number> = { p: .012, n: .019, b: .023, r: .020, q: .030, k: .037 };
    const h = stature[type] ?? .012;
    add(new THREE.CylinderGeometry(type==='r' ? .012 : .007, .012, h, 14), material, .012+h/2);
    if (type==='n') {
      const neck = new THREE.Mesh(new THREE.BoxGeometry(.014, .012, .021), material);
      neck.position.set(-.004,0,.028);
      neck.rotation.y = -.35;
      neck.castShadow = true;
      group.add(neck);
    } else if (type==='r') {
      add(new THREE.CylinderGeometry(.013, .013, .008, 8), gold, .037);
    } else if (type==='k') {
      add(new THREE.BoxGeometry(.004, .006, .017), gold, .058);
      add(new THREE.BoxGeometry(.014, .006, .004), gold, .062);
    } else if (type==='q') {
      add(new THREE.ConeGeometry(.014, .015, 7), gold, .05);
    } else if (type==='b') {
      add(new THREE.ConeGeometry(.011, .018, 12), gold, .045);
    } else {
      add(new THREE.SphereGeometry(.010, 12, 10), material, .03);
    }
    return group;
  }

  /** Mode A: command MuJoCo IK through source/target. No claim of physical grasp. */
  async showRobotMove(move: Move) {
    const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
    if (this.disposed || !this.provider.isReady) return;
    this.provider.setIkEnabled(true);
    for (const [square, z, ms] of [[move.from, .21, 650], [move.from, .10, 500], [move.to, .23, 920], [move.to, .12, 440]] as const) {
      if (this.disposed) return;
      const target = chessSquarePosition(square, z);
      this.provider.moveIkTargetTo(target, ms);
      await wait(ms + 130);
    }
  }

  dispose() {
    this.disposed = true;
    this.renderer.domElement.removeEventListener('pointerdown', this.onDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onUp);
    this.camera.position.copy(this.cameraPosition);
    this.controls.target.copy(this.cameraTarget);
    this.controls.update();
    this.clearPieceLayer();
    this.group.removeFromParent();
    this.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
    });
    for (const template of this.baroqueTemplates.values()) {
      template.traverse(object => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
    }
    this.baroqueTemplates.clear();
  }
}
