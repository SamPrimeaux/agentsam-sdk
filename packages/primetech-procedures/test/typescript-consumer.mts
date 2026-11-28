import {
  PRIMETECH_ICON_COLORWAY_IDS,
  beginGeneration,
  buildEpubPackage,
  buildIconFamily,
  buildSpriteAtlas,
  buildTypefacePackage,
  buildDesignSystemPackage,
  compareVisuals,
  completeGeneration,
  createPrimeTechProcedureHandler,
  createProcedureCatalog,
  createProductionBoard,
  failGeneration,
  listProductionBoards,
  packageCreativeAssets,
  productionBoardContract,
  resumeProductionBoard,
  summarizeProcedureRuns,
  validateProcedureManifest,
  type ProcedureManifest,
  type ProcedureRunResult,
  type ProductionBoard,
} from '@inneranimalmedia/primetech-procedures';
import {
  getPrimeTechSkill,
  loadPrimeTechSkillCatalog,
  validatePrimeTechSkillPackage,
  type PrimeTechSkill,
} from '@inneranimalmedia/primetech-procedures/skills';

const manifest: ProcedureManifest = {
  schema: 'inneranimalmedia.primetech.procedure.v1',
  id: 'repo.git.status',
  version: '1.0.0',
  summary: 'Read repository status',
  effect: 'read',
  capabilities: [],
  runtime: { kind: 'bash', entrypoint: 'run.sh' },
  input_schema: { type: 'object' },
  output_schema: { type: 'object' },
  verification: { kind: 'output_schema' },
  flags: { network: false, physical_hardware: false, requires_operator_review: false },
};

const validation = validateProcedureManifest(manifest);
const catalog = createProcedureCatalog();
const entries = catalog.list();
const handler = createPrimeTechProcedureHandler({
  projectRoot: '/tmp/primetech-project',
  invokeSamOperation: async (operation, input) => ({ ok: true, data: { operation, input } }),
  authorizeProcedure: async request => request.effect === 'project_write',
  verifyProcedureOutput: async request => ({ kind: request.manifest.verification.kind, ok: true }),
});
const procedureRun: Promise<ProcedureRunResult> = handler({ id: 'repo.git.status', version: '1.0.0', input: {} });
const colorways = PRIMETECH_ICON_COLORWAY_IDS.map(id => ({ id, foreground: '#111111', background: '#ffffff' }));
const iconBuild = buildIconFamily({ projectRoot: '/tmp/primetech-project', sourceSvgPath: 'brand/mark.svg', colorways });
const typefaceBuild = buildTypefacePackage({ projectRoot: '/tmp/primetech-project', sourcePath: 'typeface/design.json' });
const spriteBuild = buildSpriteAtlas({ projectRoot: '/tmp/primetech-project', framePaths: ['a.png', 'b.png'], pivot: [0.5, 0.5] });
const visualCheck = compareVisuals({ projectRoot: '/tmp/primetech-project', referencePath: 'reference.png', renderedPath: 'rendered.png' });
const designSystem = buildDesignSystemPackage({ projectRoot: '/tmp/primetech-project', tokensPath: 'tokens.json' });
const assets = packageCreativeAssets({ projectRoot: '/tmp/primetech-project', name: 'release-pack', files: [{ path: 'logo.svg' }] });
const ebook = buildEpubPackage({ projectRoot: '/tmp/primetech-project', sourcePath: 'book.json' });
const board = createProductionBoard({ projectRoot: '/tmp/primetech-project', title: 'Launch', objective: 'Prepare assets' });
const boardList = listProductionBoards({ projectRoot: '/tmp/primetech-project' });
const begin = beginGeneration({ projectRoot: '/tmp/primetech-project', boardId: 'ptb_0123456789abcdef01234567', kind: 'image.generate', brief: 'Create cover' });
const complete = completeGeneration({ projectRoot: '/tmp/primetech-project', boardId: 'ptb_0123456789abcdef01234567', generationId: 'gen_1', artifacts: [{ ref: 'r2://assets/cover.webp' }], qualityChecks: [{ name: 'dimensions', status: 'pass' }] });
const fail = failGeneration({ projectRoot: '/tmp/primetech-project', boardId: 'ptb_0123456789abcdef01234567', generationId: 'gen_1', error: { code: 'render_failed' } });
const resume = resumeProductionBoard({ projectRoot: '/tmp/primetech-project', boardId: 'ptb_0123456789abcdef01234567' });
const performance = summarizeProcedureRuns({ receiptDir: '/tmp/primetech-project/.agentsam/receipts' });
const skill: Promise<PrimeTechSkill | null> = getPrimeTechSkill({ id: 'primetech-iconography' });
const skills: Promise<PrimeTechSkill[]> = loadPrimeTechSkillCatalog();
const skillValidation = validatePrimeTechSkillPackage({ expectedCount: 9 });
const boardType: ProductionBoard | undefined = (await board).board;

void [validation, entries, procedureRun, iconBuild, typefaceBuild, spriteBuild, visualCheck, designSystem, assets, ebook,
  board, boardList, begin, complete, fail, resume, performance, skill, skills, skillValidation, boardType,
  productionBoardContract.generationStatuses];
