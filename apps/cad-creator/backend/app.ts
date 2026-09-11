import express from 'express';
import { cadRouter } from './routes/cad';
import { blenderRouter } from './routes/blender';
import { projectRouter } from './routes/project';
import { designRouter } from './routes/design';
import { aiRouter } from './routes/ai';
import { CadPathSandbox } from './security/paths';

export function createCadApp(): express.Express {
  const app = express();

  // Ensure sandbox storage directories exist
  CadPathSandbox.ensureDirectoriesExist();

  // Standard middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Mount API route hierarchies
  app.use('/api/cad/blender', blenderRouter);
  app.use('/api/cad/design', designRouter);
  app.use('/api/cad', projectRouter);
  app.use('/api/cad', cadRouter);
  app.use('/api', aiRouter);

  return app;
}
