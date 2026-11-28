/** TypeScript declarations for PrimeTech's resumable production board. */
export type ProductionGenerationStatus = 'queued' | 'running' | 'needs_review' | 'completed' | 'failed' | 'cancelled';
export interface ProductionBoardProject {
  id: string | null;
  title: string;
  objective: string;
  brief: string;
  tags: string[];
}
export interface ProductionGenerationArtifact { ref: string; [key: string]: unknown; }
export interface ProductionGenerationQualityCheck { name: string; status: 'pass' | 'fail' | 'warn'; [key: string]: unknown; }
export interface ProductionBoardGeneration {
  id: string;
  kind: string;
  status: ProductionGenerationStatus;
  brief: string;
  prompt: string;
  sourceRefs: string[];
  idempotencyKey: string | null;
  attempt: number;
  artifacts: ProductionGenerationArtifact[];
  qualityChecks: ProductionGenerationQualityCheck[];
  events: Array<{ type: string; at: string; [key: string]: unknown }>;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  receipt?: Record<string, unknown>;
  error?: { code: string; message: string };
  retryable?: boolean;
}
export interface ProductionBoard {
  schema: 'agentsam.primetech.production-board.v1';
  id: string;
  project: ProductionBoardProject;
  status: string;
  revision: number;
  generations: ProductionBoardGeneration[];
  createdAt: string;
  updatedAt: string;
}
export interface ProductionBoardSummary {
  boardId: string;
  title: string;
  status: string;
  revision: number;
  generationCount: number;
  updatedAt: string;
}
export interface ProductionBoardActionResult {
  ok: true;
  boardId?: string;
  revision?: number;
  status?: string;
  path?: string;
  board?: ProductionBoard;
  generationId?: string;
  generation?: ProductionBoardGeneration;
  qualityPassed?: boolean;
  retryable?: boolean;
  idempotentReplay?: boolean;
  resumableCount?: number;
  resumable?: ProductionBoardGeneration[];
}
export interface ProductionBoardListResult { ok: true; count: number; boards: ProductionBoardSummary[]; }
export interface CreateProductionBoardInput {
  projectRoot: string;
  title: string;
  objective: string;
  brief?: string;
  projectId?: string | null;
  tags?: string[];
}
export interface ProductionBoardIdInput { projectRoot: string; boardId: string; }
export interface BeginProductionGenerationInput extends ProductionBoardIdInput {
  generationId?: string | null;
  idempotencyKey?: string | null;
  kind: string;
  brief: string;
  prompt?: string;
  sourceRefs?: string[];
  expectedRevision?: number | null;
}
export interface CompleteProductionGenerationInput extends ProductionBoardIdInput {
  generationId: string;
  artifacts: ProductionGenerationArtifact[];
  qualityChecks: ProductionGenerationQualityCheck[];
  receipt?: Record<string, unknown>;
  expectedRevision?: number | null;
}
export interface FailProductionGenerationInput extends ProductionBoardIdInput {
  generationId: string;
  error: { code: string; message?: string };
  retryable?: boolean;
  expectedRevision?: number | null;
}
export function createProductionBoard(input: CreateProductionBoardInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; path: string; board: ProductionBoard }>;
export function getProductionBoard(input: ProductionBoardIdInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; board: ProductionBoard }>;
export function listProductionBoards(input: { projectRoot: string }): Promise<ProductionBoardListResult>;
export function beginGeneration(input: BeginProductionGenerationInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; generationId: string; generation: ProductionBoardGeneration }>;
export function completeGeneration(input: CompleteProductionGenerationInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; generationId: string; qualityPassed: boolean; generation: ProductionBoardGeneration }>;
export function failGeneration(input: FailProductionGenerationInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; generationId: string; retryable: boolean; generation: ProductionBoardGeneration }>;
export function resumeProductionBoard(input: ProductionBoardIdInput): Promise<ProductionBoardActionResult & { boardId: string; revision: number; status: string; resumableCount: number; resumable: ProductionBoardGeneration[] }>;
export const productionBoardContract: { readonly schema: 'agentsam.primetech.production-board.v1'; readonly generationStatuses: readonly ProductionGenerationStatus[] };
