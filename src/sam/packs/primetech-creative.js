import { defineSamOperation } from '../define.js';
import {
  PRIMETECH_ICON_COLORWAY_IDS,
  buildIconFamily,
  buildTypefacePackage,
  buildSpriteAtlas,
  compareVisuals,
  buildDesignSystemPackage,
  packageCreativeAssets,
  buildEpubPackage,
  createProductionBoard,
  getProductionBoard,
  listProductionBoards,
  beginGeneration,
  completeGeneration,
  failGeneration,
  resumeProductionBoard,
} from '@inneranimalmedia/primetech-procedures';

export const PRIMETECH_CREATIVE_OPERATION_IDS = Object.freeze([
  'primetech.icon-family.build',
  'primetech.typeface.package',
  'primetech.sprite-atlas.build',
  'primetech.visuals.compare',
  'primetech.design-system.package',
  'primetech.assets.package',
  'primetech.ebook.package',
  'primetech.production-board.manage',
]);

const optionalPath = { type: 'string', minLength: 1, maxLength: 240 };
const outputSchema = {
  type: 'object',
  properties: { ok: { type: 'boolean' } },
  required: ['ok'],
  additionalProperties: true,
};
const colorwaySchema = {
  type: 'object',
  required: ['id', 'foreground', 'background'],
  properties: {
    id: { type: 'string', enum: [...PRIMETECH_ICON_COLORWAY_IDS] },
    foreground: { type: 'string', pattern: '^#[0-9a-fA-F]{3,8}$' },
    background: { type: 'string', pattern: '^#[0-9a-fA-F]{3,8}$' },
  },
  additionalProperties: false,
};

export const PRIMETECH_CREATIVE_INPUT_SCHEMAS = Object.freeze({
  iconFamily: {
    type: 'object', required: ['sourceSvgPath', 'colorways'],
    properties: {
      sourceSvgPath: optionalPath,
      outputDir: optionalPath,
      colorways: { type: 'array', minItems: 8, maxItems: 8, items: colorwaySchema },
      sizes: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'integer', minimum: 16, maximum: 4096 } },
    }, additionalProperties: false,
  },
  typeface: {
    type: 'object', required: ['sourcePath'],
    properties: {
      sourcePath: optionalPath, outputDir: optionalPath,
      licenseText: { type: 'string', maxLength: 20000 },
      specimenText: { type: 'string', maxLength: 4000 },
    }, additionalProperties: false,
  },
  spriteAtlas: {
    type: 'object', required: ['framePaths'],
    properties: {
      framePaths: { type: 'array', minItems: 1, maxItems: 256, items: optionalPath },
      outputDir: optionalPath,
      columns: { type: 'integer', minimum: 1, maximum: 32 },
      cellWidth: { type: 'integer', minimum: 1, maximum: 4096 },
      cellHeight: { type: 'integer', minimum: 1, maximum: 4096 },
      padding: { type: 'integer', minimum: 0, maximum: 128 },
      fps: { type: 'integer', minimum: 1, maximum: 60 },
      loop: { type: 'boolean' },
    }, additionalProperties: false,
  },
  visualCompare: {
    type: 'object', required: ['referencePath', 'renderedPath'],
    properties: {
      referencePath: optionalPath, renderedPath: optionalPath, outputDir: optionalPath,
      pixelThreshold: { type: 'integer', minimum: 1, maximum: 255 },
      maxMeanAbsoluteError: { type: 'number', minimum: 0, maximum: 255 },
      maxChangedPixelRatio: { type: 'number', minimum: 0, maximum: 1 },
    }, additionalProperties: false,
  },
  designSystem: {
    type: 'object', required: ['tokensPath'],
    properties: { tokensPath: optionalPath, outputDir: optionalPath, projectName: { type: 'string', minLength: 1, maxLength: 160 } },
    additionalProperties: false,
  },
  assetPackage: {
    type: 'object', required: ['assetPaths'],
    properties: {
      assetPaths: { type: 'array', minItems: 1, maxItems: 512, items: optionalPath },
      outputDir: optionalPath, packageName: { type: 'string', minLength: 1, maxLength: 120 },
    }, additionalProperties: false,
  },
  ebook: {
    type: 'object', required: ['sourcePath'],
    properties: { sourcePath: optionalPath, outputDir: optionalPath },
    additionalProperties: false,
  },
  productionBoard: {
    type: 'object', required: ['action'],
    properties: {
      action: { type: 'string', enum: ['create', 'get', 'list', 'begin', 'complete', 'fail', 'resume'] },
      title: { type: 'string', minLength: 1, maxLength: 160 },
      objective: { type: 'string', minLength: 1, maxLength: 1200 },
      brief: { type: 'string', maxLength: 12000 },
      projectId: { type: ['string', 'null'], maxLength: 160 },
      tags: { type: 'array', maxItems: 32, items: { type: 'string', maxLength: 48 } },
      boardId: { type: 'string', pattern: '^ptb_[a-f0-9]{24}$' },
      generationId: { type: 'string', minLength: 1, maxLength: 160 },
      idempotencyKey: { type: 'string', minLength: 1, maxLength: 200 },
      kind: { type: 'string', pattern: '^[a-z][a-z0-9_.-]{1,79}$' },
      generationBrief: { type: 'string', minLength: 1, maxLength: 8000 },
      prompt: { type: 'string', maxLength: 12000 },
      sourceRefs: { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 1024 } },
      artifacts: { type: 'array', maxItems: 256, items: { type: 'object', additionalProperties: true } },
      quality: { type: 'object', additionalProperties: true },
      error: { type: 'object', required: ['code'], properties: { code: { type: 'string', minLength: 1, maxLength: 120 }, message: { type: 'string', maxLength: 1000 } }, additionalProperties: false },
      retryable: { type: 'boolean' },
      expectedRevision: { type: 'integer', minimum: 1 },
    }, additionalProperties: false,
  },
});

function defineCreativeOperation({ id, action, summary, purpose, skill, capability, schema, handler }) {
  return defineSamOperation({
    id, module: 'primetech', action, summary, purpose, outcome: summary,
    description: summary,
    skill: { id: skill, help: true },
    accepts: ['brand-assets', 'svg', 'png', 'jpeg', 'webp', 'typeface-json', 'sprite-frames', 'design-tokens', 'epub-source'],
    phases: ['validate-input', 'produce-artifacts', 'verify-output', 'write-manifest'],
    artifacts: ['manifest', 'source-preserving-derivatives', 'quality-evidence'],
    execution: { lanes: ['local'], model: 'never', network: 'none', sideEffects: 'local_write', embedding: 'never', provider_spend: 'never' },
    risk: 'write', status: 'experimental', capabilities: [capability],
    input_schema: schema, output_schema: outputSchema,
    handler,
  });
}

export function createPrimeTechCreativeOperations({ projectRoot } = {}) {
  if (typeof projectRoot !== 'string' || !projectRoot.startsWith('/')) throw new Error('primetech_project_root_binding_required');
  const root = projectRoot;
  return [
    defineCreativeOperation({
      id: 'primetech.icon-family.build', action: 'build-icon-family',
      summary: 'Build a complete icon family from an approved SVG master: three shapes, eight named colorways, requested raster sizes, transparent-corner checks and a checksummed manifest.',
      purpose: 'Turn an approved vector mark into a consistent, production-ready icon family without altering the source master.',
      skill: 'primetech-iconography', capability: 'design.write', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.iconFamily,
      handler: input => buildIconFamily({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.typeface.package', action: 'package-typeface',
      summary: 'Validate a Typeface Studio source document, compile and reparse a static TTF, generate specimen and source files, and package the verified typeface.',
      purpose: 'Convert designed glyph contours into a usable, verifiable font deliverable while preserving editable source geometry.',
      skill: 'primetech-type-design', capability: 'media.export', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.typeface,
      handler: input => buildTypefacePackage({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.sprite-atlas.build', action: 'build-sprite-atlas',
      summary: 'Pack ordered character or pet animation frames into a transparent sprite atlas with frame metadata and a controllable HTML preview.',
      purpose: 'Produce an editable, indexed sprite sheet and preview without changing the supplied source frames.',
      skill: 'primetech-character-sprites', capability: 'media.export', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.spriteAtlas,
      handler: input => buildSpriteAtlas({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.visuals.compare', action: 'compare-visuals',
      summary: 'Compare same-sized reference and rendered images, calculate pixel error metrics, and save diff, overlay and evidence report.',
      purpose: 'Provide measurable visual regression evidence without claiming semantic quality from pixel similarity alone.',
      skill: 'primetech-visual-qa', capability: 'design.write', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.visualCompare,
      handler: input => compareVisuals({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.design-system.package', action: 'package-design-system',
      summary: 'Validate design tokens, calculate contrast ratios, generate CSS variables and documentation, and package the design system with source provenance.',
      purpose: 'Turn approved tokens into a portable design-system deliverable with explicit contrast evidence.',
      skill: 'primetech-design-systems', capability: 'design.write', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.designSystem,
      handler: input => buildDesignSystemPackage({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.assets.package', action: 'package-creative-assets',
      summary: 'Package selected creative assets with preserved source files, content hashes, metadata and a machine-readable delivery manifest.',
      purpose: 'Create a traceable handoff package from user-approved source assets and generated derivatives.',
      skill: 'primetech-creative-delivery', capability: 'media.export', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.assetPackage,
      handler: input => packageCreativeAssets({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.ebook.package', action: 'package-epub',
      summary: 'Validate a structured book source and generate an EPUB 3 archive, navigation, preview and integrity manifest.',
      purpose: 'Produce a standards-structured digital publication with source and archive verification.',
      skill: 'primetech-digital-publishing', capability: 'media.export', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.ebook,
      handler: input => buildEpubPackage({ projectRoot: root, ...input }),
    }),
    defineCreativeOperation({
      id: 'primetech.production-board.manage', action: 'manage-production-board',
      summary: 'Create, inspect and update a revisioned PrimeTech production board with idempotent generation receipts, quality gates, retryable failures and resumable work.',
      purpose: 'Keep multi-stage creative production traceable and recoverable without inventing progress or losing artifact lineage.',
      skill: 'primetech-brand-kit', capability: 'workflow.execute', schema: PRIMETECH_CREATIVE_INPUT_SCHEMAS.productionBoard,
      handler: async input => {
        const { action, generationBrief, ...data } = input;
        if (action === 'create') return createProductionBoard({ projectRoot: root, ...data });
        if (action === 'get') return getProductionBoard({ projectRoot: root, ...data });
        if (action === 'list') return listProductionBoards({ projectRoot: root });
        if (action === 'begin') return beginGeneration({ projectRoot: root, brief: generationBrief, ...data });
        if (action === 'complete') return completeGeneration({ projectRoot: root, ...data });
        if (action === 'fail') return failGeneration({ projectRoot: root, ...data });
        if (action === 'resume') return resumeProductionBoard({ projectRoot: root, ...data });
        throw new Error('production_board_action_invalid');
      },
    }),
  ];
}
