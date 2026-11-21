/**
 * Scene v2 object vocabulary, independently of the CAD kernel and the renderer.
 * Creation-entry presence is not proof of an installed, executable handler.
 * The list corresponds to the 33 Create entries in the supplied 2026-11-20
 * Spline interaction inventory. Templates is catalog content, not an object.
 */
export const IAMSCENE_V2_CREATE_OBJECTS = [
  {kind:'rectangle', family:'2d'}, {kind:'ellipse', family:'2d'},
  {kind:'triangle', family:'2d'}, {kind:'pentagon', family:'2d'},
  {kind:'star', family:'2d'},
  {kind:'text', family:'vector-ui'}, {kind:'input', family:'vector-ui'},
  {kind:'path', family:'vector-ui'}, {kind:'shape-blend', family:'vector-ui'},
  {kind:'decal', family:'vector-ui'},
  {kind:'particle-emitter', family:'simulation'},
  {kind:'particle-force', family:'simulation'},
  {kind:'hair-system', family:'simulation'},
  {kind:'plane', family:'3d'}, {kind:'backdrop', family:'3d'},
  {kind:'cube', family:'3d'}, {kind:'sphere', family:'3d'},
  {kind:'cylinder', family:'3d'}, {kind:'torus', family:'3d'},
  {kind:'helix', family:'3d'}, {kind:'cone', family:'3d'},
  {kind:'pyramid', family:'3d'}, {kind:'icosahedron', family:'3d'},
  {kind:'dodecahedron', family:'3d'}, {kind:'torus-knot', family:'3d'},
  {kind:'lathe', family:'3d'}, {kind:'bunny', family:'3d'},
  {kind:'teapot', family:'3d'},
  {kind:'group', family:'hierarchy'}, {kind:'camera', family:'hierarchy'},
  {kind:'point-light', family:'hierarchy'},
  {kind:'directional-light', family:'hierarchy'},
  {kind:'spot-light', family:'hierarchy'},
] as const;
export type IAMSceneV2CreatableKind = typeof IAMSCENE_V2_CREATE_OBJECTS[number]['kind'];
export type IAMSceneV2ObjectKind = IAMSceneV2CreatableKind | 'mesh' | 'pulse' | 'light';
export const IAMSCENE_V2_OBJECT_KINDS: readonly IAMSceneV2ObjectKind[] = [
  ...IAMSCENE_V2_CREATE_OBJECTS.map(item => item.kind), 'mesh', 'pulse', 'light',
];
/** No executable handlers are invented by listing an object kind. */
export type SceneV2AdapterOperations = 'create' | 'inspect' | 'render' | 'serialize';
export interface SceneV2ObjectAdapter {
  kind: IAMSceneV2ObjectKind;
  create?: (...args: never[]) => unknown;
  inspect?: (...args: never[]) => unknown;
  render?: (...args: never[]) => unknown;
  serialize?: (...args: never[]) => unknown;
}
export function describeSceneV2ObjectSupport(kind: IAMSceneV2ObjectKind, adapters: readonly SceneV2ObjectAdapter[] = []) {
  const adapter = adapters.find(item => item.kind === kind);
  return {
    kind,
    registered: IAMSCENE_V2_OBJECT_KINDS.includes(kind),
    operations: {
      create: typeof adapter?.create === 'function' ? 'implemented' : 'unavailable',
      inspect: typeof adapter?.inspect === 'function' ? 'implemented' : 'unavailable',
      render: typeof adapter?.render === 'function' ? 'implemented' : 'unavailable',
      serialize: typeof adapter?.serialize === 'function' ? 'implemented' : 'unavailable',
    },
  };
}
