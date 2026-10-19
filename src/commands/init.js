import fs from 'node:fs';
import path from 'node:path';
import VaultStore from '../store/VaultStore.js';
import { VAULT_PATH, __cliDir } from '../lib/vault.js';
import { t } from '../lib/i18n.js';

// Carpetas estándar del vault; cada una tiene su README en templates/vault/<dir>/
const VAULT_DIRS = ['projects', 'areas', 'resources', 'daily'];

// ── Handlers — Init ───────────────────────────────────────────────────────────

export function cmdInit() {
  const templateRoot = path.join(__cliDir, '..', 'templates', 'vault');
  fs.mkdirSync(VAULT_PATH, { recursive: true });
  for (const dir of VAULT_DIRS) {
    const target = path.join(VAULT_PATH, dir);
    fs.mkdirSync(target, { recursive: true });
    // Nunca pisar un README que el usuario ya tenga
    const readme = path.join(target, 'README.md');
    const source = path.join(templateRoot, dir, 'README.md');
    if (!fs.existsSync(readme) && fs.existsSync(source)) fs.copyFileSync(source, readme);
  }

  // VaultStore se encarga de crear .mempunk/ y mempunk.db
  new VaultStore(VAULT_PATH);
  console.log(t('init.done', { path: VAULT_PATH }));
}
