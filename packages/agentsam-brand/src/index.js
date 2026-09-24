export { brandScan } from './scan.js';
export { brandResolve, parseDeclaredColor } from './resolve.js';
export { buildBrandContractDraft, writeBrandArtifacts } from './contract.js';
export { brandPlan } from './plan.js';
export {
  brandGoapActions,
  brandWorldFromPlan,
  brandGoalFromPlan,
} from './goap-actions.js';

export const BRAND_CAPABILITY_META = Object.freeze({
  'brand.scan': {
    id: 'brand.scan',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    produces: ['brand.evidence'],
  },
  'brand.resolve': {
    id: 'brand.resolve',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    produces: ['brand.resolved'],
  },
  'brand.plan': {
    id: 'brand.plan',
    deterministic: true,
    model_required: false,
    model_assisted_optional: true,
    side_effects: 'none',
    produces: ['brand.plan'],
  },
  'brand.apply': {
    id: 'brand.apply',
    deterministic: true,
    model_required: false,
    side_effects: 'repository-write',
    status: 'stub',
  },
  'brand.verify': {
    id: 'brand.verify',
    deterministic: true,
    model_required: false,
    side_effects: 'none',
    status: 'stub',
  },
});
