import fs from 'node:fs';
import path from 'node:path';
import VaultStore from '../store/VaultStore.js';
import { VAULT_PATH } from '../lib/vault.js';
import { t } from '../lib/i18n.js';

// ── Handlers — Init ───────────────────────────────────────────────────────────

export function cmdInit() {
  // Crear la estructura base del vault con todas las carpetas estándar
  const dirs = [
    VAULT_PATH,
    path.join(VAULT_PATH, 'projects'),
    path.join(VAULT_PATH, 'areas'),
    path.join(VAULT_PATH, 'resources'),
    path.join(VAULT_PATH, 'daily'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // VaultStore se encarga de crear .mempunk/ y mempunk.db
  new VaultStore(VAULT_PATH);
  console.log(t('init.done', { path: VAULT_PATH }));
}
