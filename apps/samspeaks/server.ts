import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

import { handleSamSpeaksRequest } from '../../src/models/samspeaks-runtime.js';

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));
  for (const prefix of ['/api/samspeaks', '/api']) {
    for (const operation of ['health', 'tts', 'script-assist', 'compose']) {
      app.all(prefix + '/' + operation, async (req: Request, res: Response) => {
        const request = new globalThis.Request('http://localhost/api/samspeaks/' + operation, {
          method: req.method,
          ...(req.method === 'GET' || req.method === 'HEAD' ? {} : {body: JSON.stringify(req.body ?? {}), headers: {'content-type':'application/json'}}),
        });
        const response = await handleSamSpeaksRequest(request, {
          apiKey: process.env.GEMINI_API_KEY,
          ttsModel: process.env.SAMSPEAKS_TTS_MODEL,
          textModel: process.env.SAMSPEAKS_TEXT_MODEL,
        });
        res.status(response.status).set('cache-control','private, no-store').json(await response.json());
      });
    }
  }

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
    console.log(`SamSpeaks server listening on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
