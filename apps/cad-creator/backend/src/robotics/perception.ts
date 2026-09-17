import { GoogleGenAI } from '@google/genai';

export type RoboticsDetectionType = '2D bounding boxes' | 'Points';

export interface RoboticsPerceptionRequest {
  imageSrcBase64: string;
  prompt: string;
  type: RoboticsDetectionType;
  temperature?: number;
  enableThinking?: boolean;
  modelId?: string;
}

interface DetectionItem {
  box_2d?: [number, number, number, number];
  point?: [number, number];
  label: string;
}

const DEFAULT_MODEL = 'gemini-robotics-er-2-preview';
const DEFAULT_ALLOWED_MODELS = [DEFAULT_MODEL, 'gemini-flash-latest'];

const PROMPT_PARTS: Record<RoboticsDetectionType, [string, string, string]> = {
  '2D bounding boxes': [
    'Detect',
    'items',
    ', with no more than 25 items. DO NOT detect items that only match the description partially. Output a JSON list where each entry contains the 2D bounding box in "box_2d" and a text label in "label".',
  ],
  Points: [
    'Identify',
    'items',
    ' in the scene and mark them with points. DO NOT mark items that only match the description partially. Follow the JSON format: [{"point": [y, x], "label": "label"}, ...]. The points are in [y, x] format normalized to 0-1000.',
  ],
};

function asFiniteTuple(value: unknown, length: number): number[] | null {
  if (!Array.isArray(value) || value.length !== length) return null;
  const values = value.map(Number);
  if (!values.every(Number.isFinite)) return null;
  if (!values.every((n) => n >= 0 && n <= 1000)) return null;
  return values;
}

function normalizeDetection(value: unknown): DetectionItem | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Target Object';
  const box = asFiniteTuple(item.box_2d, 4);
  const point = asFiniteTuple(item.point, 2);

  if (!box && !point) return null;
  return {
    ...(box ? { box_2d: box as [number, number, number, number] } : {}),
    ...(point ? { point: point as [number, number] } : {}),
    label,
  };
}

function parseDetectionList(text: string): DetectionItem[] {
  let jsonText = text.replace(/```json|```/gi, '').trim();
  const firstBracket = jsonText.indexOf('[');
  const lastBracket = jsonText.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1) {
    jsonText = jsonText.slice(firstBracket, lastBracket + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const seen = new Set<string>();
  const result: DetectionItem[] = [];
  for (const raw of parsed.slice(0, 25)) {
    const item = normalizeDetection(raw);
    if (!item) continue;
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export function getRoboticsPerceptionCapabilities(env: NodeJS.ProcessEnv | Record<string, string | undefined>) {
  const allowedModels = (env.CAD_ROBOTICS_PERCEPTION_MODELS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    provider: 'gemini',
    configured: Boolean(env.GEMINI_API_KEY),
    defaultModel: env.CAD_ROBOTICS_DEFAULT_MODEL || DEFAULT_MODEL,
    allowedModels: allowedModels.length ? allowedModels : DEFAULT_ALLOWED_MODELS,
    detectionTypes: ['2D bounding boxes', 'Points'] as RoboticsDetectionType[],
    coordinates: 'normalized_0_1000',
    maxDetections: 25,
  };
}

export async function runRoboticsPerception(
  request: RoboticsPerceptionRequest,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
) {
  if (!request || typeof request !== 'object') {
    throw Object.assign(new Error('A perception request body is required.'), { statusCode: 400, code: 'invalid_request' });
  }
  if (!request.imageSrcBase64 || typeof request.imageSrcBase64 !== 'string') {
    throw Object.assign(new Error('imageSrcBase64 is required.'), { statusCode: 400, code: 'missing_image' });
  }
  if (request.type !== '2D bounding boxes' && request.type !== 'Points') {
    throw Object.assign(new Error('type must be "2D bounding boxes" or "Points".'), { statusCode: 400, code: 'invalid_detection_type' });
  }

  if (!env.GEMINI_API_KEY) {
    throw Object.assign(new Error('GEMINI_API_KEY is not configured for robotics perception.'), {
      statusCode: 503,
      code: 'robotics_provider_not_configured',
    });
  }

  const capabilities = getRoboticsPerceptionCapabilities(env);
  const modelId = request.modelId || capabilities.defaultModel;
  if (!capabilities.allowedModels.includes(modelId)) {
    throw Object.assign(new Error(`Model is not enabled for robotics perception: ${modelId}`), {
      statusCode: 400,
      code: 'unsupported_robotics_model',
    });
  }

  const temperature = Number.isFinite(Number(request.temperature))
    ? Math.max(0, Math.min(2, Number(request.temperature)))
    : 0.1;
  const enableThinking = request.enableThinking !== false;
  const parts = PROMPT_PARTS[request.type];
  const subject = typeof request.prompt === 'string' && request.prompt.trim() ? request.prompt.trim() : parts[1];
  const textPrompt = `${parts[0]} ${subject}${parts[2]}`;
  const mimeMatch = request.imageSrcBase64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const mimeType = mimeMatch?.[1] || 'image/png';
  const base64Data = request.imageSrcBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '');

  if (!base64Data) {
    throw Object.assign(new Error('The image payload is empty.'), { statusCode: 400, code: 'empty_image' });
  }

  const config: Record<string, unknown> = {
    temperature,
    responseMimeType: 'application/json',
  };
  if (!enableThinking) config.thinkingConfig = { thinkingBudget: 0 };

  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: modelId,
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Data } },
        { text: textPrompt },
      ],
    },
    config,
  });

  const responseText = response.text;
  if (!responseText) {
    throw Object.assign(new Error('The robotics perception provider returned no text.'), {
      statusCode: 502,
      code: 'empty_provider_response',
    });
  }

  const items = parseDetectionList(responseText);
  const logId = crypto.randomUUID();
  const logEntry = {
    id: logId,
    timestamp: new Date().toISOString(),
    imageSrc: request.imageSrcBase64,
    prompt: subject,
    fullPrompt: textPrompt,
    type: request.type,
    result: items,
    requestData: {
      model: modelId,
      contents: { parts: [{ inlineData: { data: '<IMAGE>', mimeType } }, { text: textPrompt }] },
      config,
    },
  };

  return {
    items,
    canonicalDetections: items.map((item, index) => ({
      id: `det-${logId}-${index}`,
      label: item.label,
      ...(item.box_2d ? { box_2d: item.box_2d } : {}),
      ...(item.point ? { point: item.point } : {}),
    })),
    logEntry,
    rawResponse: {
      model: modelId,
      text: responseText,
    },
  };
}
