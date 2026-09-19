/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Package: @inneranimalmedia/ecommerce-cms-agentsam
 * Module: AgentSam Model Catalog Authority
 *
 * SSOT for AI model capabilities matching the canonical D1 table:
 * CREATE TABLE "agentsam_model_catalog" (
 *   id TEXT PRIMARY KEY NOT NULL,
 *   model_key TEXT UNIQUE NOT NULL,
 *   display_name TEXT NOT NULL,
 *   provider TEXT NOT NULL CHECK(provider IN ('anthropic','openai','google','workers_ai','ollama','cursor','deepseek')),
 *   ...
 * )
 *
 * Credentials and model capabilities are strictly decoupled:
 * Catalog = what a model CAN do.
 * Provider Connection = whether its provider is authenticated.
 * Policy/Binding = what this installation allows.
 */

export type ModelProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'workers_ai'
  | 'ollama'
  | 'cursor'
  | 'deepseek';

export type ModelTier = 'flagship' | 'frontier' | 'fast' | 'reasoning' | 'embedding' | 'audio';

export interface AgentSamModelDefinition {
  id: string;
  model_key: string;
  display_name: string;
  provider: ModelProvider;
  api_platform: string; // e.g. 'gemini-v1beta', 'openai-v1', 'cf-workers-ai'
  tier: ModelTier;
  context_window_tokens: number;
  max_output_tokens: number;
  supports_reasoning: boolean;
  supports_effort_scaling: boolean;
  supports_tools: boolean;
  supports_vision: boolean;
  supports_streaming: boolean;
  supports_json_mode: boolean;
  supports_code_execution: boolean;
  supports_realtime_audio: boolean;
  is_active: boolean;
  is_visible_in_picker: boolean;
  cost_per_million_input?: number;
  cost_per_million_output?: number;
}

/**
 * Standard baseline models seeded in agentsam_model_catalog
 */
export const CANONICAL_MODEL_CATALOG: AgentSamModelDefinition[] = [
  {
    id: 'mdl_gemini_2_5_flash',
    model_key: 'gemini-2.5-flash',
    display_name: 'Gemini 2.5 Flash',
    provider: 'google',
    api_platform: 'gemini-v1beta',
    tier: 'fast',
    context_window_tokens: 1048576,
    max_output_tokens: 8192,
    supports_reasoning: true,
    supports_effort_scaling: true,
    supports_tools: true,
    supports_vision: true,
    supports_streaming: true,
    supports_json_mode: true,
    supports_code_execution: true,
    supports_realtime_audio: false,
    is_active: true,
    is_visible_in_picker: true,
    cost_per_million_input: 0.15,
    cost_per_million_output: 0.60
  },
  {
    id: 'mdl_gemini_2_5_pro',
    model_key: 'gemini-2.5-pro',
    display_name: 'Gemini 2.5 Pro',
    provider: 'google',
    api_platform: 'gemini-v1beta',
    tier: 'frontier',
    context_window_tokens: 2097152,
    max_output_tokens: 8192,
    supports_reasoning: true,
    supports_effort_scaling: true,
    supports_tools: true,
    supports_vision: true,
    supports_streaming: true,
    supports_json_mode: true,
    supports_code_execution: true,
    supports_realtime_audio: false,
    is_active: true,
    is_visible_in_picker: true,
    cost_per_million_input: 1.25,
    cost_per_million_output: 5.00
  },
  {
    id: 'mdl_gpt4o',
    model_key: 'gpt-4o',
    display_name: 'GPT-4o Omni',
    provider: 'openai',
    api_platform: 'openai-v1',
    tier: 'frontier',
    context_window_tokens: 128000,
    max_output_tokens: 16384,
    supports_reasoning: false,
    supports_effort_scaling: false,
    supports_tools: true,
    supports_vision: true,
    supports_streaming: true,
    supports_json_mode: true,
    supports_code_execution: false,
    supports_realtime_audio: true,
    is_active: true,
    is_visible_in_picker: true,
    cost_per_million_input: 2.50,
    cost_per_million_output: 10.00
  },
  {
    id: 'mdl_claude_3_7_sonnet',
    model_key: 'claude-3-7-sonnet',
    display_name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    api_platform: 'anthropic-v1',
    tier: 'reasoning',
    context_window_tokens: 200000,
    max_output_tokens: 64000,
    supports_reasoning: true,
    supports_effort_scaling: true,
    supports_tools: true,
    supports_vision: true,
    supports_streaming: true,
    supports_json_mode: true,
    supports_code_execution: true,
    supports_realtime_audio: false,
    is_active: true,
    is_visible_in_picker: true,
    cost_per_million_input: 3.00,
    cost_per_million_output: 15.00
  },
  {
    id: 'mdl_cf_llama_3_3',
    model_key: 'cf-llama-3.3-70b',
    display_name: 'Llama 3.3 70B (Workers AI)',
    provider: 'workers_ai',
    api_platform: 'cf-workers-ai',
    tier: 'fast',
    context_window_tokens: 131072,
    max_output_tokens: 8192,
    supports_reasoning: false,
    supports_effort_scaling: false,
    supports_tools: true,
    supports_vision: false,
    supports_streaming: true,
    supports_json_mode: true,
    supports_code_execution: false,
    supports_realtime_audio: false,
    is_active: true,
    is_visible_in_picker: true,
    cost_per_million_input: 0.10,
    cost_per_million_output: 0.35
  }
];

export type ModelDefinition = AgentSamModelDefinition;
export const AGENTSAM_MODEL_CATALOG = CANONICAL_MODEL_CATALOG;

