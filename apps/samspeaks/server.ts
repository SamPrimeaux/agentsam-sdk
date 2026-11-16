import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const VALID_VOICES = new Set([
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Zephyr',
  'Aoede',
  'Leda',
  'Orus',
  'Callirrhoe',
  'Autonoe',
  'Sulafat',
  'Enceladus',
  'Gacrux',
  'Despina',
  'Umbriel',
]);

function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface TtsSinglePayload {
  mode: 'single';
  text: string;
  voiceName?: string;
  stylePrompt?: string;
}

interface TtsDualPayload {
  mode: 'dual';
  text: string;
  speakerA?: string;
  speakerB?: string;
  voiceA?: string;
  voiceB?: string;
  styleA?: string;
  styleB?: string;
}

type TtsPayload = TtsSinglePayload | TtsDualPayload;

function parseDualDialogueParts(
  rawText: string,
  speakerA: string,
  speakerB: string,
  styleA: string,
  styleB: string
) {
  const lines = rawText
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parts: Array<{
    text: string;
    speechMetadata: { speaker: string; style?: string };
  }> = [];

  let fallbackIndex = 0;
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && colonIdx < 24) {
      const prefix = line.slice(0, colonIdx).trim();
      const content = line.slice(colonIdx + 1).trim();
      if (content) {
        const isB =
          prefix.toLowerCase() === speakerB.toLowerCase() ||
          (prefix.toLowerCase() !== speakerA.toLowerCase() && fallbackIndex % 2 === 1);
        const speaker = isB ? speakerB : speakerA;
        const style = isB ? styleB : styleA;
        parts.push({
          text: `${speaker}: ${content}`,
          speechMetadata: style ? { speaker, style } : { speaker },
        });
        fallbackIndex++;
        continue;
      }
    }
    const isB = fallbackIndex % 2 === 1;
    const speaker = isB ? speakerB : speakerA;
    const style = isB ? styleB : styleA;
    parts.push({
      text: `${speaker}: ${line}`,
      speechMetadata: style ? { speaker, style } : { speaker },
    });
    fallbackIndex++;
  }

  if (parts.length === 0) {
    parts.push({
      text: `${speakerA}: Welcome to Atelier XR.`,
      speechMetadata: styleA ? { speaker: speakerA, style: styleA } : { speaker: speakerA },
    });
  }

  return parts;
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      ttsModel: 'gemini-3.8-flash-tts',
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post('/api/tts', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as Partial<TtsPayload>;
      const rawText = typeof body.text === 'string' ? body.text.trim() : '';
      if (!rawText) {
        res.status(400).json({ error: 'Please enter a script to synthesize.' });
        return;
      }
      if (rawText.length > 4000) {
        res.status(400).json({ error: 'Script is too long (max 4000 characters).' });
        return;
      }

      const ai = getGenAI();
      const mode = body.mode === 'dual' ? 'dual' : 'single';

      let response;
      if (mode === 'dual') {
        const dual = body as Partial<TtsDualPayload>;
        const speakerA = (dual.speakerA || 'Alex').trim() || 'Alex';
        const speakerB = (dual.speakerB || 'Sam').trim() || 'Sam';
        const voiceA = VALID_VOICES.has(dual.voiceA || '') ? String(dual.voiceA) : 'Puck';
        const voiceB = VALID_VOICES.has(dual.voiceB || '') ? String(dual.voiceB) : 'Kore';
        const styleA = (dual.styleA || 'Enthusiastic creative director').trim();
        const styleB = (dual.styleB || 'Curious sound designer').trim();

        const parts = parseDualDialogueParts(rawText, speakerA, speakerB, styleA, styleB);

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts,
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              multiSpeakerVoiceConfig: {
                speakerVoiceConfigs: [
                  {
                    speaker: speakerA,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: voiceA },
                    },
                  },
                  {
                    speaker: speakerB,
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: voiceB },
                    },
                  },
                ],
              },
            },
          },
        });
      } else {
        const single = body as Partial<TtsSinglePayload>;
        const voiceName = VALID_VOICES.has(single.voiceName || '')
          ? String(single.voiceName)
          : 'Kore';
        const stylePrompt = (single.stylePrompt || '').trim();

        const part: { text: string; speechMetadata?: { style: string } } = {
          text: rawText,
        };
        if (stylePrompt) {
          part.speechMetadata = { style: stylePrompt };
        }

        response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-tts',
          contents: [
            {
              role: 'user',
              parts: [part],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
            },
          },
        });
      }

      const candidateParts = response.candidates?.[0]?.content?.parts || [];
      let base64Audio: string | undefined;
      let mimeType = 'audio/wav';
      for (const p of candidateParts) {
        if (p.inlineData?.data) {
          base64Audio = p.inlineData.data;
          mimeType = p.inlineData.mimeType || 'audio/wav';
          break;
        }
      }

      if (!base64Audio) {
        res.status(502).json({
          error: 'Gemini TTS returned no audio data. Please try adjusting the script.',
        });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType,
        model: 'gemini-3.8-flash-tts',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate speech.';
      console.error('[/api/tts] error:', message);
      res.status(500).json({ error: message });
    }
  });

  async function generateTextWithFallback(params: {
    contents: unknown;
    systemInstruction: string;
    responseMimeType?: string;
    responseSchema?: unknown;
  }) {
    const ai = getGenAI();
    const runModel = async (model: string, level: ThinkingLevel) => {
      const config: Record<string, unknown> = {
        thinkingConfig: { thinkingLevel: level },
        systemInstruction: params.systemInstruction,
      };
      if (params.responseMimeType) config.responseMimeType = params.responseMimeType;
      if (params.responseSchema) config.responseSchema = params.responseSchema;

      return ai.models.generateContent({
        model,
        contents: params.contents as Parameters<typeof ai.models.generateContent>[0]['contents'],
        config: config as Parameters<typeof ai.models.generateContent>[0]['config'],
      });
    };

    try {
      return await Promise.race([
        runModel('gemini-4-hydrogen', ThinkingLevel.LOW),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('GEMINI_4_TIMEOUT')), 9000)
        ),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'GEMINI_4_TIMEOUT' || msg.includes('404') || msg.includes('NOT_FOUND')) {
        return await runModel('gemini-3.1-flash-lite', ThinkingLevel.MINIMAL);
      }
      throw err;
    }
  }

  app.post('/api/script-assist', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        subjectTitle?: string;
        subjectDescription?: string;
        mode?: 'single' | 'dual';
        topic?: string;
      };
      const mode = body.mode === 'dual' ? 'dual' : 'single';
      const subjectTitle = body.subjectTitle || 'Harmonic Astrolabe';
      const subjectDescription =
        body.subjectDescription || 'a kinetic brass and glass spatial sculpture';
      const topic = (body.topic || '').trim();

      const prompt =
        mode === 'dual'
          ? `Write a concise, lively 2-turn creative studio dialogue between Alex and Sam reacting to "${subjectTitle}" (${subjectDescription}). ${topic ? `Focus on: ${topic}.` : ''} Include 1 natural vocal burst like <breath> or <laugh> and 1 backchannel like |yeah| or |mhm|. Format strictly as two lines starting with "Alex: " and "Sam: ". Keep under 45 words total.`
          : `Write a vivid, cinematic 2-sentence studio showcase narration about "${subjectTitle}" (${subjectDescription}). ${topic ? `Focus on: ${topic}.` : ''} Include one subtle <breath> cue where natural. Keep under 38 words total.`;

      const response = await generateTextWithFallback({
        contents: prompt,
        systemInstruction:
          'You are a creative director writing ultra-concise, expressive voiceover scripts for a 3D XR design studio. Return only the script text, no markdown fences or quotes.',
      });

      const script = (response.text || '').trim();
      if (!script) {
        res.status(502).json({ error: 'No script text returned.' });
        return;
      }
      res.json({ script });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate script.';
      console.error('[/api/script-assist] error:', message);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/compose', async (req: Request, res: Response) => {
    try {
      const body = (req.body || {}) as {
        prompt?: string;
        subjectLabel?: string;
        mood?: string;
        images?: Array<{ mimeType?: string; data?: string; name?: string }>;
      };
      const userPrompt = (body.prompt || '').trim();
      const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];

      if (!userPrompt && images.length === 0) {
        res.status(400).json({
          error: 'Type a movie/adventure prompt or drop an image for miniAgentSam.',
        });
        return;
      }

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];

      for (const img of images) {
        if (img?.data && img?.mimeType) {
          const cleanData = img.data.includes(',')
            ? img.data.split(',')[1]
            : img.data;
          parts.push({
            inlineData: {
              mimeType: img.mimeType,
              data: cleanData,
            },
          });
        }
      }

      const subjectLabel = body.subjectLabel || 'Astrolabe';
      const currentMood = body.mood || 'studio';
      const instruction = [
        `Compose a 3 to 4 beat cinematic 3D guided movie walkthrough & audio storyboard for Atelier XR.`,
        `Current 3D centerpiece: "${subjectLabel}". Current atmosphere: "${currentMood}".`,
        images.length > 0
          ? `The user dropped ${images.length} reference image(s) into the 3D scene—weave visual details from those images directly into the narration, mood, and camera beats.`
          : '',
        userPrompt
          ? `User creative brief: "${userPrompt}"`
          : `Create a vivid guided adventure around the dropped imagery and 3D sculpture.`,
        `Each beat must specify:`,
        `- title: short 2-4 word scene title`,
        `- script: 1-2 expressive spoken sentences (under 35 words). Can include <breath>, <laugh>, or if ttsMode is "dual", two lines starting with "Alex: " and "Sam: " using |yeah| or |mhm|.`,
        `- ttsMode: "single" or "dual"`,
        `- voiceName: one of "Kore", "Puck", "Charon", "Fenrir", "Zephyr", "Aoede", "Leda", "Orus", "Callirrhoe", "Autonoe", "Sulafat", "Enceladus", "Gacrux", "Despina", "Umbriel"`,
        `- voiceStyle: concise speaking direction (e.g. "Warm cinematic documentary narrator")`,
        `- cameraShot: one of "establishing", "hero", "closeup", "lowAngle", "overhead", "leftProp", "rightProp"`,
        `- transitionType: one of "glide", "dolly", "orbit", "crane", "cut"`,
        `- mood: one of "studio", "sunset", "twilight", "noir", "dawn"`,
        `- explodeAmount: number between 0 and 0.85`,
      ]
        .filter(Boolean)
        .join('\n');

      parts.push({ text: instruction });

      const response = await generateTextWithFallback({
        contents: { parts },
        systemInstruction:
          'You are miniAgentSam, an imaginative 3D movie director, scenery designer, and voiceover writer. Output valid JSON matching the schema.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['movieTitle', 'beats'],
          properties: {
            movieTitle: { type: Type.STRING },
            beats: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: [
                  'title',
                  'script',
                  'ttsMode',
                  'voiceName',
                  'voiceStyle',
                  'cameraShot',
                  'transitionType',
                  'mood',
                  'explodeAmount',
                ],
                properties: {
                  title: { type: Type.STRING },
                  script: { type: Type.STRING },
                  ttsMode: { type: Type.STRING },
                  voiceName: { type: Type.STRING },
                  voiceStyle: { type: Type.STRING },
                  cameraShot: { type: Type.STRING },
                  transitionType: { type: Type.STRING },
                  mood: { type: Type.STRING },
                  explodeAmount: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      });

      const raw = (response.text || '{}').trim();
      const parsed = JSON.parse(raw) as {
        movieTitle?: string;
        beats?: Array<Record<string, unknown>>;
      };

      if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
        res.status(502).json({ error: 'miniAgentSam returned an empty storyboard.' });
        return;
      }

      res.json({
        movieTitle: parsed.movieTitle || 'Untitled Spatial Story',
        beats: parsed.beats,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to compose storyboard.';
      console.error('[/api/compose] error:', message);
      res.status(500).json({ error: message });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atelier XR server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
