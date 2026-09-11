import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { CadHealthResponse } from '../../shared/cad';
import { getCadCapabilities } from '../services/cad/capabilities';
import { CadProjectService } from '../services/cad/project';
import { CadPathSandbox } from '../security/paths';

export const cadRouter = Router();

// GET /api/cad/health
cadRouter.get('/health', async (req, res) => {
  const health: CadHealthResponse = {
    status: 'ok',
    runtime: 'AgentSam-CAD-Studio-Backend',
    version: '1.0.0',
    execution_lane: (process.env.CAD_RUNTIME_LANE as any) || 'local-mock',
    timestamp: new Date().toISOString(),
  };
  return res.json(health);
});

// GET /api/cad/capabilities
cadRouter.get('/capabilities', async (req, res) => {
  try {
    const caps = await getCadCapabilities();
    return res.json(caps);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to query capabilities' });
  }
});

// GET /api/cad/scene
cadRouter.get('/scene', async (req, res) => {
  try {
    const project = (await CadProjectService.getProject()) || {
      id: 'default_scene',
      name: 'Default Scene',
      units: 'in',
      scale: 1,
      gridSize: 12,
      snapToGrid: true,
      walls: [],
      doors: [],
      windows: [],
      furniture: [],
      rooms: [],
      annotations: [],
      lighting: {
        sunAltitude: 45,
        sunAzimuth: 135,
        intensity: 1.2,
        timeOfDay: 'noon',
        shadows: true,
        ambientColor: '#ffffff',
      },
      roofType: 'flat',
      ceilingHeight: 108,
      updatedAt: Date.now(),
      version: 1,
    };

    const scene = CadProjectService.calculateScene(project);
    return res.json(scene);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/cad/artifacts/:file
cadRouter.get('/artifacts/:filename', (req, res) => {
  try {
    const safePath = CadPathSandbox.resolveSafePath(req.params.filename, 'artifacts');
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Artifact not found' });
    }
    return res.sendFile(safePath);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// GET /api/cad/renders/:file
cadRouter.get('/renders/:filename', (req, res) => {
  try {
    const safePath = CadPathSandbox.resolveSafePath(req.params.filename, 'renders');
    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: 'Render not found' });
    }
    return res.sendFile(safePath);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
