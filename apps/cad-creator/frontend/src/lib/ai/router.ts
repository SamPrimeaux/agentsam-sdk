export type AICapability =
  | 'spatial_planning'
  | 'design_reasoning'
  | 'vision_to_geometry'
  | 'parametric_generation'
  | 'image_generation'
  | 'video_generation';

export interface ModelFleetConfig {
  spatial_planning: string;
  design_reasoning: string;
  vision_to_geometry: string;
  parametric_generation: string;
  image_generation: string;
  video_generation: string;
}

export const DEFAULT_MODEL_FLEET: ModelFleetConfig = {
  spatial_planning: 'gemini-2.5-flash',
  design_reasoning: 'gemini-2.5-flash',
  vision_to_geometry: 'gemini-2.5-flash',
  parametric_generation: 'gemini-2.5-flash',
  image_generation: 'imagen-3.0-generate-002',
  video_generation: 'veo-2.0-generate-001',
};

export class AIModelRouter {
  private fleet: ModelFleetConfig;

  constructor(customFleet?: Partial<ModelFleetConfig>) {
    this.fleet = { ...DEFAULT_MODEL_FLEET, ...customFleet };
  }

  getModelForCapability(capability: AICapability): string {
    return this.fleet[capability] || this.fleet.spatial_planning;
  }

  setFleetConfig(newFleet: Partial<ModelFleetConfig>) {
    this.fleet = { ...this.fleet, ...newFleet };
  }

  getFleetConfig(): ModelFleetConfig {
    return { ...this.fleet };
  }
}

export const globalAIRouter = new AIModelRouter();
