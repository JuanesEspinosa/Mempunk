// Bundlea cada hook de src/hooks/ a dist/hooks/ como archivo autocontenido.
//
// Los hooks se copian solos a ~/.claude/hooks/ (sin node_modules): el bundle
// inlinea src/hooks-lib/common.js. El banner re-agrega el marker
// "# mempunk-hook" que install/uninstall usan para identificar archivos de
// Mempunk (esbuild descarta los comentarios de la fuente).

/* global console */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

const HOOKS = ['on-start', 'on-stop', 'on-compact', 'on-prompt'];

const BANNER = [
  '#!/usr/bin/env node',
  '// # mempunk-hook',
  '// Bundle generado desde src/hooks/ — editar la fuente y correr npm run build.',
].join('\n');

mkdirSync('dist/hooks', { recursive: true });

for (const hook of HOOKS) {
  await build({
    entryPoints: [`src/hooks/${hook}.js`],
    outfile: `dist/hooks/${hook}.js`,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node18',
    banner: { js: BANNER },
  });
}

console.log(`Hooks bundleados a dist/hooks/ (${HOOKS.length} archivos)`);
