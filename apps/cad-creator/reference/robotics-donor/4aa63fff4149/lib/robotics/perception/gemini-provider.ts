/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { v4 as uuidv4 } from 'uuid';
import { DetectionResult } from '../../../shared/cad/src/robotics/types';
import { LogEntry } from '../../../types';
import { PerceptionResult } from '../types';
import { defaultPromptParts, PerceptionProvider, PerceptionRequest, PerceptionResponse } from './provider';

/**
 * GeminiRoboticsPerceptionProvider
 * Concrete implementation of PerceptionProvider using the @google/genai SDK
 * with support for spatial bounding box and coordinate point detection.
 */
export class GeminiRoboticsPerceptionProvider implements PerceptionProvider {
  name = 'Gemini Robotics Embodied Reasoning';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Updates or sets the API key dynamically
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Execute object detection / embodied reasoning query against Gemini
   */
  async detect(request: PerceptionRequest): Promise<PerceptionResponse> {
    const {
      imageSrcBase64,
      prompt,
      type,
      temperature = 0.1,
      enableThinking = true,
      modelId = 'gemini-robotics-er-2-preview'
    } = request;

    const base64Data = imageSrcBase64.replace(/^data:image\/\w+;base64,/, '');
    const parts = defaultPromptParts[type];
    const subject = prompt.trim() || parts[1];
    const textPrompt = `${parts[0]} ${subject}${parts[2]}`;

    // Configure model options
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const config: any = {
      temperature,
      responseMimeType: "application/json",
    };

    if (!enableThinking) {
      config.thinkingConfig = { thinkingBudget: 0 };
    }

    const requestLogData = {
      model: modelId,
      contents: {
        parts: [
          { inlineData: { data: "<IMAGE>", mimeType: "image/png" } },
          { text: textPrompt }
        ]
      },
      config: config
    };

    const logId = uuidv4();
    const logEntry: LogEntry = {
      id: logId,
      timestamp: new Date(),
      imageSrc: imageSrcBase64,
      prompt,
      fullPrompt: textPrompt,
      type,
      result: null,
      requestData: requestLogData
    };

    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64Data } },
            { text: textPrompt }
          ]
        },
        config: config
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response text returned from Gemini API.");
      }

      let jsonText = text.replace(/```json|```/g, '').trim();
      const firstBracket = jsonText.indexOf('[');
      const lastBracket = jsonText.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        jsonText = jsonText.substring(firstBracket, lastBracket + 1);
      }

      let parsed: unknown[];
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        parsed = [];
      }

      // Deduplicate results
      if (Array.isArray(parsed)) {
        const seen = new Set<string>();
        parsed = parsed.filter((item: unknown) => {
          const serialized = JSON.stringify(item);
          if (seen.has(serialized)) return false;
          seen.add(serialized);
          return true;
        });
      } else {
        parsed = [];
      }

      const items: PerceptionResult[] = (parsed as Array<{ box_2d?: number[]; point?: number[]; label?: string }>).map(item => ({
        box_2d: item.box_2d,
        point: item.point,
        label: item.label || 'Target Object'
      }));

      const canonicalDetections: DetectionResult[] = items.map((item, index) => ({
        id: `det-${logId}-${index}`,
        label: item.label || 'Target Object',
        box_2d: item.box_2d as [number, number, number, number] | undefined,
        point: item.point as [number, number] | undefined,
        confidence: 0.95
      }));

      logEntry.result = items;

      return {
        items,
        canonicalDetections,
        logEntry,
        rawResponse: response
      };
    } catch (err: unknown) {
      const errorMsg = (err as Error).message || "Robotics vision perception failed.";
      logEntry.result = { error: errorMsg };
      throw err;
    }
  }
}
