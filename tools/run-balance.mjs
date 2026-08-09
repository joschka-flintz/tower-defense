/**
 * Runner for the headless balance test.
 *
 * `balance.ts` imports the game's TypeScript source directly, and the source
 * uses extensionless imports that plain Node cannot resolve. Rather than
 * change how the game imports things to suit a tool, this bundles the harness
 * with the esbuild that already ships inside Vite and runs the result.
 *
 *   npm run balance -- kingdom
 */

import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const workDir = mkdtempSync(join(tmpdir(), 'realm-balance-'));
const outfile = join(workDir, 'balance.mjs');

try {
  await build({
    entryPoints: [join(here, 'balance.ts')],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    logLevel: 'warning',
  });

  await import(pathToFileURL(outfile).href);
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
