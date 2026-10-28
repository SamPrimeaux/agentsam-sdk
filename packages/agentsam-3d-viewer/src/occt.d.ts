export interface OcctDisplayMesh {
  units: 'mm';
  axes: 'z-up';
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
}
export function createOcctMeshGeometry(
  mesh: OcctDisplayMesh,
  runtime: { THREE: any } | any,
  options?: { planYSign?: 1 | -1 },
): any;
