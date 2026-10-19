import { requireCadProjectV2 } from './project-v2.js';

// Each profile declares outcomes, not promises that an executor has performed them.
// Packages remain blocked until real artifacts, validations, and professional review exist.
export const CAD_DELIVERY_PROFILES = Object.freeze({
  'architecture.concept': Object.freeze([
    ['concept-plan', 'png', 'cad.drawing.generate'],
    ['aerial-image', 'webp', 'cad.presentation.render'],
    ['arrival-image', 'png', 'cad.presentation.render'],
    ['exterior-images', 'jpeg', 'cad.presentation.render'],
  ]),
  'architecture.schematic': Object.freeze([
    ['site-plan', 'pdf', 'cad.drawing.generate'],
    ['floor-plans', 'pdf', 'cad.drawing.generate'],
    ['exterior-elevations', 'pdf', 'cad.drawing.generate'],
    ['roof-plan', 'pdf', 'cad.drawing.generate'],
    ['building-sections', 'pdf', 'cad.drawing.generate'],
    ['schedules', 'csv', 'cad.schedule.generate'],
    ['cad-sheets', 'dxf', 'cad.drawing.generate'],
    ['semantic-bim', 'ifc', 'cad.bim.ifc.export'],
    ['area-takeoff', 'csv', 'cad.quantity.takeoff'],
  ]),
  'architecture.cd-preparation': Object.freeze([
    ['G-cover-code-area', 'pdf', 'cad.drawing.generate'],
    ['C-site-civil-grading', 'pdf', 'cad.drawing.generate'],
    ['A-construction-plan', 'pdf', 'cad.drawing.generate'],
    ['A-elevations', 'pdf', 'cad.drawing.generate'],
    ['A-sections-details', 'pdf', 'cad.drawing.generate'],
    ['A-interior-rcp', 'pdf', 'cad.drawing.generate'],
    ['A-schedules', 'csv', 'cad.schedule.generate'],
    ['S-foundation-framing-roof', 'pdf', 'cad.drawing.generate'],
    ['S-structural-design-inputs', 'json', 'cad.document.prepare'],
    ['M-HVAC', 'pdf', 'cad.drawing.generate'],
    ['P-plumbing', 'pdf', 'cad.drawing.generate'],
    ['E-electrical', 'pdf', 'cad.drawing.generate'],
    ['energy-code-inputs', 'json', 'cad.document.prepare'],
    ['geo-survey-requirements', 'json', 'cad.document.prepare'],
    ['professional-review-issues', 'json', 'cad.document.prepare'],
  ]),
  'architecture.interactive': Object.freeze([
    ['renderable-scene', 'glb', 'cad.scene.optimize'],
    ['walkthrough', 'json', 'cad.walkthrough.package'],
  ]),
  'architecture.cinematic': Object.freeze([
    ['scene-source', 'blend', 'cad.scene.build'],
    ['cinematic-hero', 'png', 'cad.presentation.render'],
    ['cinematic-video', 'mp4', 'cad.video.render'],
    ['movie-edit-source', 'json', 'cad.video.project.export'],
  ]),
  'architecture.professional-handoff': Object.freeze([
    ['project-source', 'json', 'cad.document.prepare'],
    ['editable-drawing-sources', 'dxf', 'cad.drawing.generate'],
    ['IFC-model', 'ifc', 'cad.bim.ifc.export'],
    ['construction-review-packet', 'pdf', 'cad.document.prepare'],
    ['source-revisions', 'json', 'cad.document.prepare'],
    ['project-package', 'zip', 'cad.deliverables.package'],
  ]),
  'mechanical.fabrication': Object.freeze([
    ['precise-solid', 'step', 'cad.solid.export'],
    ['assembly-drawing', 'dxf', 'cad.drawing.generate'],
    ['part-list', 'csv', 'cad.schedule.generate'],
    ['inspection-report', 'json', 'cad.geometry.validate'],
  ]),
});

const packageProfileCompatibility = Object.freeze({
  'architecture.': 'architecture.building',
  'mechanical.': 'mechanical.',
});
const slug = value => value.replace(/[^A-Za-z0-9_.:-]/g, '-');

export function attachCadDeliveryProfiles(project, requestedProfiles) {
  requireCadProjectV2(project);
  if (!Array.isArray(requestedProfiles) || requestedProfiles.length === 0
      || new Set(requestedProfiles).size !== requestedProfiles.length) throw new Error('invalid_delivery_profiles');
  const next = structuredClone(project);
  const existing = new Set(next.outputs.map(x => x.id));
  for (const profile of requestedProfiles) {
    const outputs = CAD_DELIVERY_PROFILES[profile];
    if (!outputs) throw new Error('unknown_delivery_profile:' + profile);
    const needs = Object.entries(packageProfileCompatibility).find(([prefix]) => profile.startsWith(prefix));
    if (needs && !(needs[1].endsWith('.') ? next.domain.startsWith(needs[1]) : next.domain === needs[1]))
      throw new Error('delivery_profile_domain_mismatch:' + profile);
    const packageId = 'package:' + slug(profile);
    if (next.packages.some(x => x.id === packageId)) throw new Error('delivery_profile_already_attached:' + profile);
    const outputIds = [];
    for (const [kind, format, capability] of outputs) {
      const id = slug(profile) + ':' + slug(kind);
      if (existing.has(id)) throw new Error('duplicate_delivery_output:' + id);
      next.outputs.push({
        id, kind, format, capability, state: 'planned', sourceRevision: next.revision,
        dependencies: [], elementIds: ['*'],
        // A CD-preparation draft is never a legal certification.
        ...(profile === 'architecture.cd-preparation' ? { professionalReviewRequired: true } : {}),
      });
      existing.add(id); outputIds.push(id);
    }
    next.packages.push({
      id: packageId, profile, outputIds, state: 'planned',
      permitReady: false, sealed: false, release: 'requires_verified_artifacts',
    });
  }
  requireCadProjectV2(next);
  return next;
}

export function inspectCadDeliveryReadiness(project, packageId) {
  requireCadProjectV2(project);
  const pkg = project.packages.find(x => x.id === packageId);
  if (!pkg) throw new Error('unknown_delivery_package');
  const missing = pkg.outputIds.filter(id => {
    const output = project.outputs.find(x => x.id === id);
    return !output || !['generated', 'validated', 'approved'].includes(output.state)
      || output.sourceRevision !== project.revision;
  });
  return {
    packageId, readyForArtifactDelivery: missing.length === 0,
    missingOutputIds: missing, permitReady: false, sealed: false,
    professionalReviewRequired: pkg.profile.includes('cd-preparation')
      || pkg.profile.includes('professional-handoff'),
  };
}
