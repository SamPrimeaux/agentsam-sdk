import { Router } from 'express';
import { NativeCadRuntime } from '../runtime/native';
import { ContainerCadRuntime } from '../runtime/container';
import { CadRuntime } from '../runtime/interface';

export const blenderRouter = Router();

// Select runtime according to environment
function getRuntime(): CadRuntime {
  const lane = process.env.CAD_RUNTIME_LANE;
  if (lane === 'cad-container') {
    return new ContainerCadRuntime();
  }
  return new NativeCadRuntime();
}

// GET /api/cad/blender/status
blenderRouter.get('/status', async (req, res) => {
  try {
    const runtime = getRuntime();
    const status = await runtime.status();
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get Blender status' });
  }
});

// POST /api/cad/blender/inspect
blenderRouter.post('/inspect', async (req, res) => {
  try {
    const { artifact_path } = req.body;
    if (!artifact_path) {
      return res.status(400).json({ error: 'artifact_path is required' });
    }

    const runtime = getRuntime();
    const result = await runtime.inspect(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Inspection failed' });
  }
});

// POST /api/cad/blender/build
blenderRouter.post('/build', async (req, res) => {
  try {
    const { recipe } = req.body;
    if (!recipe || !Array.isArray(recipe.operations)) {
      return res.status(400).json({ error: 'Valid declarative JSON CAD recipe with operations is required' });
    }

    const runtime = getRuntime();
    const result = await runtime.build(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Build failed' });
  }
});

// POST /api/cad/blender/render-preview
blenderRouter.post('/render-preview', async (req, res) => {
  try {
    const { artifact_path } = req.body;
    if (!artifact_path) {
      return res.status(400).json({ error: 'artifact_path is required' });
    }

    const runtime = getRuntime();
    const result = await runtime.renderPreview(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Render preview failed' });
  }
});

// POST /api/cad/blender/export
blenderRouter.post('/export', async (req, res) => {
  try {
    const { artifact_path, format } = req.body;
    if (!artifact_path || !format) {
      return res.status(400).json({ error: 'artifact_path and format (glb, stl, obj) are required' });
    }

    const runtime = getRuntime();
    const result = await runtime.export(req.body);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Export failed' });
  }
});
