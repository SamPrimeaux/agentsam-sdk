/** Render-only spatial brush geometry. The caller owns and disposes the result. */
export function createStrokeTubeGeometry(THREE, points, { radius, segments, radialSegments = 8 }) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, radialSegments, false);
}
