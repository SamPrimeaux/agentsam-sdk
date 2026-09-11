import { Router } from 'express';
import { compileProjectToCadRecipe } from '../services/cad/compiler';
import { NativeCadRuntime } from '../runtime/native';
import { ContainerCadRuntime } from '../runtime/container';
import { CadRuntime } from '../runtime/interface';
import { ProjectState, CadRecipe } from '../../shared/cad';

export const designRouter = Router();

function getRuntime(): CadRuntime {
  const lane = process.env.CAD_RUNTIME_LANE;
  if (lane === 'cad-container') {
    return new ContainerCadRuntime();
  }
  return new NativeCadRuntime();
}

// POST /api/cad/design/compile
designRouter.post('/compile', (req, res) => {
  try {
    const project: ProjectState = req.body.project || req.body;
    if (!project) {
      return res.status(400).json({ error: 'Project state is required' });
    }

    const recipe = compileProjectToCadRecipe(project);
    return res.json({
      success: true,
      recipe,
      summary: {
        total_operations: recipe.operations.length,
        wall_count: project.walls?.length || 0,
        opening_count: (project.doors?.length || 0) + (project.windows?.length || 0),
        room_count: project.rooms?.length || 0,
        fixture_count: project.furniture?.length || 0,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Geometry compilation failed' });
  }
});

// POST /api/cad/design/render
designRouter.post('/render', async (req, res) => {
  try {
    const project: ProjectState = req.body.project;
    let recipe: CadRecipe = req.body.recipe;

    if (!recipe && project) {
      recipe = compileProjectToCadRecipe(project);
    }

    if (!recipe) {
      return res.status(400).json({ error: 'Either project or recipe is required' });
    }

    const runtime = getRuntime();

    // 1. Build .blend artifact
    const buildRes = await runtime.build({ recipe });
    if (!buildRes.success) {
      return res.status(500).json({ error: buildRes.error || 'Failed to build CAD model for render' });
    }

    // 2. Render preview
    const renderRes = await runtime.renderPreview({
      artifact_path: buildRes.artifact.storagePath,
      width: req.body.width || 1280,
      height: req.body.height || 720,
      engine: req.body.engine === 'CYCLES' ? 'CYCLES' : 'BLENDER_EEVEE_NEXT',
    });

    if (!renderRes.success) {
      return res.status(500).json({ error: renderRes.error || 'Failed to render preview' });
    }

    return res.json({
      success: true,
      image_url: renderRes.preview_url,
      receipt: renderRes.artifact,
      render_engine: renderRes.render_metadata.engine,
      duration_ms: renderRes.render_metadata.duration_ms,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Design render failed' });
  }
});

// POST /api/cad/design/export
designRouter.post('/export', async (req, res) => {
  try {
    const project: ProjectState = req.body.project;
    let recipe: CadRecipe = req.body.recipe;
    const format = req.body.format || 'glb';

    if (!recipe && project) {
      recipe = compileProjectToCadRecipe(project);
    }

    if (!recipe) {
      return res.status(400).json({ error: 'Either project or recipe is required' });
    }

    const runtime = getRuntime();

    // 1. Build .blend artifact
    const buildRes = await runtime.build({ recipe });
    if (!buildRes.success) {
      return res.status(500).json({ error: buildRes.error || 'Failed to build model before export' });
    }

    // 2. Export to target format
    const exportRes = await runtime.export({
      artifact_path: buildRes.artifact.storagePath,
      format,
    });

    if (!exportRes.success) {
      return res.status(500).json({ error: exportRes.error || 'Export failed' });
    }

    return res.json({
      success: true,
      receipt: exportRes.artifact,
      download_url: exportRes.artifact.downloadUrl || `/api/cad/artifacts/${exportRes.artifact.filename}`,
      format: exportRes.format,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Design export failed' });
  }
});
