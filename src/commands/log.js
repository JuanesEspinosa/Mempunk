import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fail } from '../lib/output.js';
import { t } from '../lib/i18n.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Log (abrir proyecto en editor) ─────────────────────────────────

export function cmdOpenLog(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk log <project_id>' }));
  requireVault();

  const store = openStore();
  if (!store.listProjects().find(p => p.id === projectId)) {
    fail(t('project.notFound', { id: projectId }));
  }

  const projectDir = path.join(VAULT_PATH, 'projects', projectId);
  if (!fs.existsSync(projectDir)) fail(t('log.dirNotFound', { dir: projectDir }));

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
  console.log(t('log.opened', { target }));
}
