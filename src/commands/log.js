import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Log (abrir proyecto en editor) ─────────────────────────────────

export function cmdOpenLog(projectId) {
  if (!projectId) fail('Uso: mempunk log <project_id>');
  requireVault();

  const store = openStore();
  if (!store.listProjects().find(p => p.id === projectId)) {
    fail(`Proyecto no encontrado: ${projectId}`);
  }

  const projectDir = path.join(VAULT_PATH, 'projects', projectId);
  if (!fs.existsSync(projectDir)) fail(`Directorio no encontrado: ${projectDir}`);

  const indexFile = path.join(projectDir, 'INDEX.md');
  const target    = fs.existsSync(indexFile) ? indexFile : projectDir;

  const editor = process.env.VISUAL || process.env.EDITOR;
  if (editor) {
    spawnSync(editor, [target], { stdio: 'inherit' });
  } else {
    const opener = process.platform === 'win32' ? 'explorer'
      : process.platform === 'darwin' ? 'open'
      : 'xdg-open';
    spawnSync(opener, [target], { stdio: 'ignore', detached: true });
  }
  console.log(`Abierto: ${target}`);
}
