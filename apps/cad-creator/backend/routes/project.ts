import { Router } from 'express';
import { CadProjectService } from '../services/cad/project';
import { ProjectState } from '../../shared/cad';

export const projectRouter = Router();

// GET /api/cad/project
projectRouter.get('/project', async (req, res) => {
  try {
    const id = (req.query.id as string) || 'default_project';
    let project = await CadProjectService.getProject(id);

    if (!project) {
      // Default initial architectural project
      project = {
        schema_version: 1,
        id,
        name: 'AgentSam Architectural Studio Project',
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
      await CadProjectService.saveProject(project);
    }

    const provider = CadProjectService.getProvider();
    return res.json({
      success: true,
      project,
      storage_provider: provider.name,
      revision: project.version || 1,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load project' });
  }
});

// POST /api/cad/project
projectRouter.post('/project', async (req, res) => {
  try {
    const project: ProjectState = req.body.project || req.body;
    if (!project || !project.id) {
      return res.status(400).json({ error: 'Valid project object with id is required' });
    }

    const saved = await CadProjectService.saveProject(project);
    const provider = CadProjectService.getProvider();
    return res.json({
      success: true,
      project: saved,
      storage_provider: provider.name,
      revision: saved.version,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save project' });
  }
});

// PATCH /api/cad/project
projectRouter.patch('/project', async (req, res) => {
  try {
    const { id, updates } = req.body;
    const targetId = id || updates?.id || 'default_project';
    const existing = await CadProjectService.getProject(targetId);

    if (!existing) {
      return res.status(404).json({ error: `Project ${targetId} not found` });
    }

    const merged: ProjectState = {
      ...existing,
      ...updates,
      id: targetId,
      updatedAt: Date.now(),
      version: (existing.version || 1) + 1,
    };

    const saved = await CadProjectService.saveProject(merged);
    const provider = CadProjectService.getProvider();
    return res.json({
      success: true,
      project: saved,
      storage_provider: provider.name,
      revision: saved.version,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to patch project' });
  }
});

// GET /api/cad/projects
projectRouter.get('/projects', async (req, res) => {
  try {
    const list = await CadProjectService.listProjects();
    return res.json({ success: true, projects: list });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
