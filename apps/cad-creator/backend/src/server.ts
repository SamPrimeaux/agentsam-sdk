import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { getRoboticsPerceptionCapabilities, runRoboticsPerception } from './robotics/perception';
import { probeAllCadTools } from './cad/discovery';
import { executeOpenScadCompiler } from './cad/openscad';
import { executeFreeCadBuild } from './cad/freecad';
import { executeBlenderBuild } from './cad/blender';
import { probeDockerServiceHealth } from './cad/docker-executor';

const CAD_ROOT = path.resolve(process.cwd(), '..');
const FRONTEND_ROOT = path.join(CAD_ROOT, 'frontend');
dotenv.config({ path: path.join(CAD_ROOT, '.env') });

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy Gemini API initialization helper
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment.');
    }
    aiClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return aiClient;
}

// ----------------------------------------------------
// 1. ARCHITECTURAL BIM PLANNING API
// ----------------------------------------------------
app.post('/api/plan/generate', async (req, res) => {
  try {
    const { prompt, currentProject } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const ai = getAI();
    const systemInstruction = `You are AgentSam, an expert architectural CAD / BIM copilot.
Your task is to generate or modify 2D CAD vector coordinates and 3D architectural parameters for a floor plan based on user instructions.
Dimensions are in inches (1 foot = 12 inches, 10 feet = 120 inches).
All coordinates should be integers.

Return ONLY a valid JSON object with the following schema:
{
  "explanation": "Brief explanation of architectural layout, zoning, and dimensions",
  "walls": [
    {
      "id": "unique_wall_id",
      "x1": number,
      "y1": number,
      "x2": number,
      "y2": number,
      "thickness": number (default 6),
      "height3D": number (default 96),
      "material": "drywall" | "concrete" | "brick" | "glass" | "wood_panel",
      "exterior": boolean
    }
  ],
  "doors": [
    {
      "id": "unique_door_id",
      "wallId": "target_wall_id",
      "distanceAlongWall": number (between 0.1 and 0.9),
      "width": number (default 36),
      "height": number (default 84),
      "swing": "left" | "right",
      "openAngle": number (default 30)
    }
  ],
  "windows": [
    {
      "id": "unique_win_id",
      "wallId": "target_wall_id",
      "distanceAlongWall": number (between 0.1 and 0.9),
      "width": number (default 48),
      "height": number (default 48),
      "elevation": number (default 36)
    }
  ],
  "rooms": [
    {
      "id": "unique_room_id",
      "name": string (e.g. "Living Room", "Master Bedroom", "Kitchen"),
      "points": [[x, y], [x, y], [x, y], ...],
      "areaSqFt": number,
      "floorMaterial": "hardwood" | "tile" | "carpet" | "concrete" | "marble"
    }
  ],
  "furniture": [
    {
      "id": "unique_furn_id",
      "type": string (e.g. "sofa_3seater", "dining_6", "king_bed", "kitchen_island", "bathtub", "desk"),
      "category": "seating" | "tables" | "bedroom" | "kitchen" | "bathroom" | "office" | "decor",
      "name": string,
      "x": number,
      "y": number,
      "w": number,
      "d": number,
      "h": number,
      "rotation": number (degrees 0-360),
      "color": string (hex color)
    }
  ]
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
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Plan generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate plan' });
  }
});

// ----------------------------------------------------
// 2. VISION SKETCH-TO-BIM API
// ----------------------------------------------------
app.post('/api/vision/parse-sketch', async (req, res) => {
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
Scale the floor plan to a realistic residential size (e.g. 240" x 360" or similar).

Return ONLY valid JSON matching the architectural schema:
{
  "walls": [{ "id": string, "x1": number, "y1": number, "x2": number, "y2": number, "thickness": 6, "exterior": boolean }],
  "doors": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 36 }],
  "windows": [{ "id": string, "wallId": string, "distanceAlongWall": number, "width": 48 }],
  "rooms": [{ "id": string, "name": string, "points": [[x,y], [x,y], ...], "areaSqFt": number, "floorMaterial": "hardwood"|"tile"|"concrete"|"marble" }],
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
    const parsed = JSON.parse(text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Vision sketch parsing error:', error);
    return res.status(500).json({ error: error.message || 'Failed to parse sketch' });
  }
});

// ----------------------------------------------------
// 3. GEMINI IMAGE GENERATION & EDITING
// ----------------------------------------------------
app.post('/api/image/generate', async (req, res) => {
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

app.post('/api/image/edit', async (req, res) => {
  try {
    const { prompt, image, aspectRatio = '16:9' } = req.body;
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

// ----------------------------------------------------
// 4. VEO VIDEO GENERATION (veo-3.1-fast-generate-preview)
// ----------------------------------------------------
app.post('/api/video/generate', async (req, res) => {
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

app.post('/api/video/status', async (req, res) => {
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

app.post('/api/video/download', async (req, res) => {
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

    const tempDir = path.join(FRONTEND_ROOT, 'public');
    const tempFilePath = path.join(tempDir, `veo_${Date.now()}.mp4`);
    
    // Download to path using @google/genai SDK
    await ai.files.download({ file: videoObj, downloadPath: tempFilePath });
    
    return res.download(tempFilePath, 'AgentSam-Walkthrough.mp4');
  } catch (error: any) {
    console.error('Veo video download error:', error);
    return res.status(500).json({ error: error.message || 'Failed to download video file' });
  }
});

// ----------------------------------------------------
// 5. ROBOTICS PERCEPTION / EMBODIED REASONING API
// ----------------------------------------------------
app.get('/api/robotics/capabilities', (_req, res) => {
  return res.json(getRoboticsPerceptionCapabilities(process.env));
});

app.post('/api/robotics/perception/detect', async (req, res) => {
  try {
    const result = await runRoboticsPerception(req.body, process.env);
    return res.json(result);
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    const code = error?.code || 'robotics_perception_failed';
    console.error('Robotics perception error:', code, error?.message || error);
    return res.status(status).json({
      error: {
        code,
        message: error?.message || 'Robotics perception failed',
      },
    });
  }
});

// ----------------------------------------------------
// 6. SERVER-SIDE OPENSCAD / CAD EXECUTION & TOOL DISCOVERY API
// ----------------------------------------------------
app.get('/api/cad/tools', async (req, res) => {
  try {
    const report = await probeAllCadTools(process.env);
    return res.json(report);
  } catch (err: any) {
    return res.status(500).json({
      error: {
        code: 'CAD_TOOL_DISCOVERY_FAILED',
        message: err?.message || 'Failed to probe CAD tools',
      },
    });
  }
});

app.get('/api/cad/health', async (req, res) => {
  try {
    const report = await probeAllCadTools(process.env);
    const dockerHealth = await probeDockerServiceHealth();
    const hasDockerLane = report.tools.some((t) => t.execution_lane === 'docker_service');
    const backend = hasDockerLane || dockerHealth.available ? 'docker-service' : 'local-browser';

    return res.json({
      status: report.all_systems_ready ? 'healthy' : 'degraded',
      backend,
      version: '2026.04',
      availableTools: report.available_tools,
      totalTools: report.total_tools,
      dockerService: {
        available: dockerHealth.available,
        url: dockerHealth.url,
        version: dockerHealth.version,
      },
      message: report.all_systems_ready
        ? 'All CAD execution kernels online'
        : 'Some CAD execution engines unavailable',
    });
  } catch (err: any) {
    return res.status(500).json({
      status: 'unavailable',
      message: err?.message || 'Health check failed',
    });
  }
});

app.get('/api/cad/docker/status', async (req, res) => {
  try {
    const health = await probeDockerServiceHealth();
    return res.json(health);
  } catch (err: any) {
    return res.status(500).json({
      available: false,
      error: err?.message || 'Failed to probe Docker service',
    });
  }
});

app.get('/api/cad/capabilities', (req, res) => {
  return res.json({
    provider: 'AgentSam-Server-CSG',
    supportedFormats: ['stl', 'dxf', 'svg', 'obj', 'scad', 'json', 'gltf', 'step', 'iges', 'brep'],
    supportsWorkerSandbox: true,
    supportsBimCompilation: true,
    supportsFreeCadSolidKernel: true,
    supportsBlenderEngine: true,
    maxExecutionTimeMs: 45000,
  });
});

app.post('/api/cad/execute', async (req, res) => {
  try {
    const { source, outputFormat = 'stl', parameters = {}, filename = 'model.stl', timeoutMs = 20000 } = req.body;
    if (!source) {
      return res.status(400).json({ error: 'Source code is required' });
    }

    const result = await executeOpenScadCompiler({
      source,
      outputFormat,
      parameters,
      filename,
      timeoutMs,
    });

    return res.json(result);
  } catch (err: any) {
    const isSecurity = String(err?.message || '').includes('Security Violation');
    return res.status(isSecurity ? 403 : 500).json({
      success: false,
      error: err.message || 'OpenSCAD execution failure',
      logs: [`[ERROR] ${err.message}`],
    });
  }
});

app.post('/api/cad/freecad/execute', async (req, res) => {
  try {
    const { operations, format = 'step', filename, timeoutMs = 30000 } = req.body;
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'operations must be a non-empty array' });
    }

    const result = await executeFreeCadBuild({
      operations,
      format,
      filename,
      timeoutMs,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'FreeCAD solid modeling failure',
      logs: [`[ERROR] ${err.message}`],
    });
  }
});

app.post('/api/cad/blender/execute', async (req, res) => {
  try {
    const { operation = 'build', recipe, operations, format = 'glb', filename, timeoutMs = 45000 } = req.body;
    const result = await executeBlenderBuild({
      operation,
      recipe,
      operations,
      format,
      filename,
      timeoutMs,
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err.message || 'Blender execution failure',
      logs: [`[ERROR] ${err.message}`],
    });
  }
});

// ----------------------------------------------------
// 6. HTTP SERVER & WEBSOCKET REAL-TIME MULTIPLAYER
// ----------------------------------------------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

interface ClientSession {
  ws: WebSocket;
  roomId: string;
  user: {
    id: string;
    name: string;
    color: string;
    role: 'Owner' | 'Editor' | 'Viewer';
  };
}

const clients = new Map<WebSocket, ClientSession>();

wss.on('connection', (ws) => {
  ws.on('message', (messageRaw: string) => {
    try {
      const data = JSON.parse(messageRaw.toString());
      const { type, roomId, user, project, cursor, targetUserId, newRole } = data;

      if (type === 'join_room') {
        // Count existing users in room to assign Owner role to the first user
        const existingInRoom = Array.from(clients.values()).filter((c) => c.roomId === roomId);
        const hasOwner = existingInRoom.some((c) => c.user.role === 'Owner');
        const assignedRole: 'Owner' | 'Editor' | 'Viewer' = !hasOwner
          ? 'Owner'
          : (user?.role || 'Editor');

        const sessionUser = {
          id: user?.id || `user_${Date.now()}`,
          name: user?.name || 'Architect',
          color: user?.color || '#3b82f6',
          role: assignedRole,
        };

        clients.set(ws, { ws, roomId, user: sessionUser });

        // Notify other clients in room
        broadcastToRoom(roomId, ws, {
          type: 'user_joined',
          user: sessionUser,
        });

        // Send active users list & assigned role to joining user
        const roomUsers = Array.from(clients.values())
          .filter((c) => c.roomId === roomId)
          .map((c) => c.user);

        ws.send(JSON.stringify({ 
          type: 'room_users', 
          users: roomUsers,
          yourRole: assignedRole,
        }));
      }

      if (type === 'change_role') {
        const session = clients.get(ws);
        if (session && session.user.role === 'Owner') {
          // Find target client in this room
          let changed = false;
          for (const targetSession of clients.values()) {
            if (targetSession.roomId === session.roomId && targetSession.user.id === targetUserId) {
              targetSession.user.role = newRole;
              changed = true;
              if (targetSession.ws.readyState === WebSocket.OPEN) {
                targetSession.ws.send(JSON.stringify({
                  type: 'role_updated',
                  role: newRole,
                  updatedBy: session.user.name,
                }));
              }
              break;
            }
          }

          if (changed) {
            // Broadcast updated user list to everyone in room (including sender)
            const roomUsers = Array.from(clients.values())
              .filter((c) => c.roomId === session.roomId)
              .map((c) => c.user);
            broadcastToRoom(session.roomId, null, {
              type: 'room_users',
              users: roomUsers,
            });
          }
        } else if (session && session.user.role !== 'Owner') {
          ws.send(JSON.stringify({
            type: 'permission_denied',
            action: 'change_role',
            message: 'Only the room Owner can manage user roles and permissions.',
          }));
        }
      }

      if (type === 'project_update') {
        const session = clients.get(ws);
        if (session) {
          // Enforce role permission: Viewers cannot push project updates
          if (session.user.role === 'Viewer') {
            ws.send(JSON.stringify({
              type: 'permission_denied',
              action: 'project_update',
              message: 'Viewers have read-only access. You cannot modify the design.',
            }));
            return;
          }

          broadcastToRoom(session.roomId, ws, {
            type: 'project_update',
            project,
            senderId: session.user.id,
          });
        }
      }

      if (type === 'cursor_move') {
        const session = clients.get(ws);
        if (session) {
          broadcastToRoom(session.roomId, ws, {
            type: 'cursor_move',
            userId: session.user.id,
            ...cursor,
          });
        }
      }
    } catch (e) {
      console.error('WebSocket message parsing error:', e);
    }
  });

  ws.on('close', () => {
    const session = clients.get(ws);
    if (session) {
      const { roomId, user } = session;
      clients.delete(ws);

      // Check if room still has users and whether an Owner is needed
      const remainingInRoom = Array.from(clients.values()).filter((c) => c.roomId === roomId);
      if (user.role === 'Owner' && remainingInRoom.length > 0) {
        // Promote next user to Owner
        remainingInRoom[0].user.role = 'Owner';
        if (remainingInRoom[0].ws.readyState === WebSocket.OPEN) {
          remainingInRoom[0].ws.send(JSON.stringify({
            type: 'role_updated',
            role: 'Owner',
            message: 'You have been promoted to Owner as the previous host disconnected.',
          }));
        }
      }

      broadcastToRoom(roomId, ws, {
        type: 'user_left',
        userId: user.id,
      });

      // Update room users for remaining clients
      const updatedUsers = remainingInRoom.map((c) => c.user);
      broadcastToRoom(roomId, null, {
        type: 'room_users',
        users: updatedUsers,
      });
    }
  });
});

function broadcastToRoom(roomId: string, senderWs: WebSocket | null, payload: any) {
  const json = JSON.stringify(payload);
  clients.forEach((session, ws) => {
    if (session.roomId === roomId && ws !== senderWs && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
    }
  });
}

// ----------------------------------------------------
// 6. START SERVER WITH VITE MIDDLEWARE
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: FRONTEND_ROOT,
      configFile: path.join(FRONTEND_ROOT, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(FRONTEND_ROOT, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, HOST, () => {
    console.log(`AgentSam DesignStudio server running on http://${HOST}:${PORT}`);
  });
}

start();
