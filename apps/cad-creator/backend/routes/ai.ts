import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

export const aiRouter = Router();

let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY || '';
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// POST /api/plan/generate
aiRouter.post('/plan/generate', async (req, res) => {
  try {
    const { prompt, currentProject } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAI();
    const systemInstruction = `You are AgentSam, an expert architectural CAD / BIM copilot.
Your task is to generate or modify 2D CAD vector coordinates and 3D architectural parameters for a floor plan based on user instructions.
Dimensions are in inches (1 foot = 12 inches, 10 feet = 120 inches). All coordinates should be integers.

Return ONLY a valid JSON object matching this schema:
{
  "explanation": "Brief explanation of architectural layout, zoning, and dimensions",
  "walls": [{ "id": string, "x1": number, "y1": number, "x2": number, "y2": number, "thickness": 6, "height3D": 108, "material": "drywall"|"brick"|"concrete"|"glass"|"wood_panel", "exterior": boolean }],
  "doors": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 36, "height": 84, "swing": "left"|"right", "openAngle": 30 }],
  "windows": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 48, "height": 48, "elevation": 36 }],
  "rooms": [{ "id": string, "name": string, "points": [[x, y], ...], "areaSqFt": number, "floorMaterial": "hardwood"|"tile"|"concrete"|"marble" }],
  "furniture": [{ "id": string, "type": string, "category": "seating"|"tables"|"bedroom"|"kitchen"|"bathroom"|"office"|"decor", "name": string, "x": number, "y": number, "w": number, "d": number, "h": number, "rotation": number, "color": string }]
}`;

    const userContent = `Current project context: ${JSON.stringify({
      wallsCount: currentProject?.walls?.length || 0,
      roomsCount: currentProject?.rooms?.length || 0,
    })}\n\nUser Request: ${prompt}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userContent,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    return res.json(JSON.parse(text));
  } catch (error: any) {
    console.error('Plan generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate plan' });
  }
});

// POST /api/vision/parse-sketch
aiRouter.post('/vision/parse-sketch', async (req, res) => {
  try {
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ error: 'Image data is required' });
    }

    const ai = getAI();
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const systemInstruction = `You are a computer vision architectural engineer.
Analyze the provided hand-drawn napkin sketch, blueprint, or floor plan drawing.
Extract the structural walls, room zones, doors, and furniture into a 2D CAD coordinate grid (units in inches).
Scale the floor plan to a realistic residential size (e.g. 240" x 360").

Return ONLY valid JSON matching the architectural schema:
{
  "walls": [{ "id": string, "x1": number, "y1": number, "x2": number, "y2": number, "thickness": 6, "exterior": boolean }],
  "doors": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 36 }],
  "windows": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 48 }],
  "rooms": [{ "id": string, "name": string, "points": [[x,y], ...], "areaSqFt": number, "floorMaterial": "hardwood"|"tile"|"concrete"|"marble" }],
  "furniture": [{ "id": string, "type": string, "name": string, "x": number, "y": number, "w": number, "d": number, "h": number, "rotation": number }]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/png',
              },
            },
            {
              text: 'Extract the vector BIM CAD geometry from this floor plan sketch.',
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text || '{}';
    return res.json(JSON.parse(text));
  } catch (error: any) {
    console.error('Vision sketch parsing error:', error);
    return res.status(500).json({ error: error.message || 'Failed to parse sketch' });
  }
});

// POST /api/image/generate
aiRouter.post('/image/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio = '16:9' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAI();
    const response = await ai.models.generateImages({
      model: 'gemini-3.1-flash-image-preview',
      prompt: `Architectural photorealistic render: ${prompt}, high end architectural photography, 8k ray tracing lighting`,
      config: {
        numberOfImages: 1,
        aspectRatio: aspectRatio as any,
        outputMimeType: 'image/jpeg',
      },
    });

    const generated = response.generatedImages?.[0]?.image?.imageBytes;
    if (!generated) {
      throw new Error('No image was returned from the generative model');
    }

    const imageUrl = `data:image/jpeg;base64,${generated}`;
    return res.json({ imageUrl });
  } catch (error: any) {
    console.error('Image generation error:', error);
    return res.status(500).json({ error: error.message || 'Image generation failed' });
  }
});

// POST /api/image/edit
aiRouter.post('/image/edit', async (req, res) => {
  try {
    const { prompt, image } = req.body;
    if (!prompt || !image) {
      return res.status(400).json({ error: 'Prompt and image are required' });
    }

    const ai = getAI();
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/jpeg',
              },
            },
            {
              text: `Edit this architectural render: ${prompt}`,
            },
          ],
        },
      ],
      config: {
        responseModalities: ['IMAGE'],
      },
    });

    const candidate = response.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find((p: any) => p.inlineData);

    if (imagePart && imagePart.inlineData?.data) {
      const mime = imagePart.inlineData.mimeType || 'image/jpeg';
      const imageUrl = `data:${mime};base64,${imagePart.inlineData.data}`;
      return res.json({ imageUrl });
    }

    throw new Error('Image edit could not produce an image part');
  } catch (error: any) {
    console.error('Image edit error:', error);
    return res.status(500).json({ error: error.message || 'Image editing failed' });
  }
});

// POST /api/video/generate
aiRouter.post('/video/generate', async (req, res) => {
  try {
    const { prompt, image, aspectRatio = '16:9', resolution = '720p' } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAI();
    let imagePayload = undefined;

    if (image) {
      const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
      imagePayload = {
        imageBytes: base64Data,
        mimeType: 'image/jpeg',
      };
    }

    const operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: `Cinematic architectural flythrough: ${prompt}, steady drone camera motion, architectural lighting`,
      ...(imagePayload ? { image: imagePayload } : {}),
      config: {
        aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
        resolution: resolution === '1080p' ? '1080p' : '720p',
      },
    });

    return res.json({
      operationName: operation.name,
      done: operation.done || false,
    });
  } catch (error: any) {
    console.error('Veo generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to start video generation' });
  }
});

// POST /api/video/status
aiRouter.post('/video/status', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    const ai = getAI();
    const operation = await ai.operations.getVideosOperation({
      operation: { name: operationName } as any,
    });

    return res.json({
      name: operation.name,
      done: operation.done || false,
      error: operation.error ? operation.error.message : null,
    });
  } catch (error: any) {
    console.error('Veo status check error:', error);
    return res.status(500).json({ error: error.message || 'Failed to check video status' });
  }
});

// POST /api/video/download
aiRouter.post('/video/download', async (req, res) => {
  try {
    const { operationName } = req.body;
    if (!operationName) {
      return res.status(400).json({ error: 'operationName is required' });
    }

    const ai = getAI();
    const operation = await ai.operations.getVideosOperation({
      operation: { name: operationName } as any,
    });

    if (!operation.done) {
      return res.status(400).json({ error: 'Video is not yet ready' });
    }

    const videoObj = operation.response?.generatedVideos?.[0]?.video;
    if (!videoObj) {
      return res.status(404).json({ error: 'No video asset found in operation result' });
    }

    const tempDir = path.join(process.cwd(), 'public');
    const tempFilePath = path.join(tempDir, `veo_${Date.now()}.mp4`);

    await ai.files.download({ file: videoObj, downloadPath: tempFilePath });
    return res.download(tempFilePath, 'AgentSam-Walkthrough.mp4');
  } catch (error: any) {
    console.error('Veo video download error:', error);
    return res.status(500).json({ error: error.message || 'Failed to download video file' });
  }
});
