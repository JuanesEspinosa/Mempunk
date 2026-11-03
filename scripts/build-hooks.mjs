// Bundlea cada hook de src/hooks/ a dist/hooks/ como archivo autocontenido.
//
// Los hooks se copian solos a ~/.claude/hooks/ (sin node_modules): el bundle
// inlinea src/hooks-lib/common.js. El banner re-agrega el marker
// "# mempunk-hook" que install/uninstall usan para identificar archivos de
// Mempunk (esbuild descarta los comentarios de la fuente).

/* global console */
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const HOOKS = ['on-start', 'on-stop', 'on-compact', 'on-prompt', 'on-tool', 'on-end'];

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

// ── Plugin de Claude Code (plugin/) ───────────────────────────────────────────
// El plugin se instala copiando solo plugin/, así que lleva su propia copia de
// los agentes. La versión de plugin.json sigue a package.json. tests/plugin.test.js
// falla si alguna de las dos copias queda desalineada.

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const manifestPath = 'plugin/.claude-plugin/plugin.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkg.version) {
  writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, version: pkg.version }, null, 2)}\n`);
}

mkdirSync('plugin/agents', { recursive: true });
const agents = readdirSync('src/agents').filter((f) => f.endsWith('.md'));
for (const agent of agents) {
  copyFileSync(`src/agents/${agent}`, `plugin/agents/${agent}`);
}
// Un agente borrado de src/agents no debe seguir publicándose en el plugin
for (const stale of readdirSync('plugin/agents').filter((f) => !agents.includes(f))) {
  rmSync(`plugin/agents/${stale}`);
}

console.log(`Plugin sincronizado: versión ${pkg.version}, ${agents.length} agentes`);
