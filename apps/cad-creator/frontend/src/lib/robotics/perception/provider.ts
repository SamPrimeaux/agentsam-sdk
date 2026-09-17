/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DetectionResult } from '@inneranimalmedia/agentsam-cad-shared/robotics';
import { DetectType, LogEntry } from '../runtime/types';
import { PerceptionResult } from '../types';

/**
 * Default prompt parts for different vision detection modes.
 * Formats prompt structure for Gemini Vision / Embodied Reasoning models.
 */
export const defaultPromptParts: Record<DetectType, [string, string, string]> = {
  '2D bounding boxes': [
    'Detect',
    'items',
    ', with no more than 25 items. DO NOT detect items that only match the description partially. Output a json list where each entry contains the 2D bounding box in "box_2d" and a text label in "label".',
  ],
  'Points': [
    'Identify ',
    'items',
    ' in the scene and mark them with points. DO NOT mark items that only match the description partially. Follow the JSON format: [{"point": [y, x], "label": "label"}, ...]. The points are in [y, x] format normalized to 0-1000.',
  ],
};

/**
 * Request specification for robotics perception calls
 */
export interface PerceptionRequest {
  imageSrcBase64: string;
  prompt: string;
  type: DetectType;
  temperature?: number;
  enableThinking?: boolean;
  modelId?: string;
}

/**
 * Structured response from a perception provider
 */
export interface PerceptionResponse {
  items: PerceptionResult[];
  canonicalDetections?: DetectionResult[];
  logEntry: LogEntry;
  rawResponse: unknown;
}

/**
 * Abstract perception provider interface for vision and embodied reasoning services
 */
export interface PerceptionProvider {
  name: string;
  detect(request: PerceptionRequest): Promise<PerceptionResponse>;
}
