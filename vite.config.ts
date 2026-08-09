import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only helper: lets the running game POST a canvas snapshot to disk so the
 * rendering can be inspected without a screen. Never part of a build.
 *
 *   fetch('/__shot?name=tower', { method: 'POST', body: canvas.toDataURL() })
 *
 * writes .shots/tower.png
 */
function screenshotSink(): Plugin {
  return {
    name: 'screenshot-sink',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('POST only');
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
          const name = (params.get('name') ?? 'shot').replace(/[^a-z0-9_-]/gi, '') || 'shot';
          const dir = resolve(process.cwd(), '.shots');
          mkdirSync(dir, { recursive: true });

          const payload = body.replace(/^data:image\/\w+;base64,/, '');
          writeFileSync(resolve(dir, `${name}.png`), Buffer.from(payload, 'base64'));

          res.statusCode = 200;
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [screenshotSink()],
});
