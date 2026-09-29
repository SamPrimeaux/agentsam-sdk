/**
 * @deprecated Import fixtures/heuristic-theme instead.
 * Runtime API must never auto-load demo content.
 */
export function buildDemoCmsBootstrap(): never {
  throw new Error(
    'buildDemoCmsBootstrap was removed from runtime. Use fixtures/heuristic-theme and seed a CmsEditorAdapter explicitly.',
  );
}
