import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { VAULT_VERSION } from '../store/VaultStore.js';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail } from '../lib/output.js';
import { VAULT_PATH, CLI_VERSION, requireVault, openStore } from '../lib/vault.js';
import { _writeProjectPathsFile } from './project.js';

// ── Handlers — Vault ──────────────────────────────────────────────────────────

export function cmdVaultVersion() {
  requireVault();
  const store = openStore(true); // sin warning — este comando es el que verifica la versión

  const vaultVersion = store.getVaultVersion();
  console.log(`CLI   v${CLI_VERSION}`);

  if (vaultVersion < VAULT_VERSION) {
    console.log(`Vault v${vaultVersion}`);
    console.log(t('vault.upgradeHint', { version: vaultVersion }));
  } else {
    console.log(t('vault.ok', { version: vaultVersion }));
  }
}

export function cmdVaultUpgrade() {
  requireVault();
  // Este es el ÚNICO punto donde se migra un vault existente — los demás
  // comandos abortan si la versión es vieja en vez de migrar en silencio
  const store = openStore(true);
  const currentVersion = store.getVaultVersion();

  if (currentVersion >= VAULT_VERSION) {
    console.log(t('vault.alreadyLatest', { version: VAULT_VERSION }));
    return;
  }

  store.migrate();

  // Si vault_meta estaba desincronizado pero las tablas ya existían (_migrationsRan === 0),
  // actualizarlo explícitamente para reflejar el estado real del schema
  store.db
    .prepare('INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)')
    .run('vault_version', String(VAULT_VERSION));

  // Regenerar el mapa de rutas por si la migración agregó root_path
  _writeProjectPathsFile(store);

  console.log(t('vault.upgraded', { version: VAULT_VERSION, count: store._migrationsRan }));
}

// Backups a retener en .mempunk/backups/ — los más viejos se podan
const MAX_BACKUPS = 10;

/** Copia consistente y verificada de mempunk.db en .mempunk/backups/ */
export function cmdVaultBackup() {
  requireVault();
  const store = openStore();

  const backupsDir = path.join(VAULT_PATH, '.mempunk', 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });

  const stamp      = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = path.join(backupsDir, `mempunk-${stamp}.db`);

  // VACUUM INTO produce una copia consistente y compacta incluso con WAL activo
  store.db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

  // Verificar la integridad de la COPIA — un backup corrupto es peor que ninguno
  const copy   = new Database(backupPath, { readonly: true });
  const result = copy.pragma('integrity_check');
  copy.close();
  if (result?.[0]?.integrity_check !== 'ok') {
    try { fs.rmSync(backupPath, { force: true }); } catch (_) {}
    fail(t('vault.backupIntegrityFailed', { result: JSON.stringify(result) }));
  }

  // Retención: conservar solo los últimos MAX_BACKUPS
  const backups = fs.readdirSync(backupsDir)
    .filter((f) => f.startsWith('mempunk-') && f.endsWith('.db'))
    .sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS))) {
    try { fs.rmSync(path.join(backupsDir, old), { force: true }); } catch (_) {}
  }

  console.log(t('vault.backupCreated', { path: backupPath }));
}

/** Dump JSON portable de todas las tablas del vault (excepto el índice FTS, que es derivado) */
export function cmdExport() {
  requireVault();
  const store = openStore();

  const TABLES = [
    'projects', 'backlog', 'decisions', 'session_log', 'project_skills',
    'resources', 'daily_logs', 'session_checkpoints', 'compact_snapshots',
  ];

  const data = {
    mempunk_version: CLI_VERSION,
    vault_version:   store.getVaultVersion(),
    vault_path:      VAULT_PATH,
    exported_at:     new Date().toISOString(),
    tables:          {},
  };
  for (const table of TABLES) {
    data.tables[table] = store.db.prepare(`SELECT * FROM ${table}`).all();
  }

  const d = new Date();
  const today   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const outPath = path.resolve(opts.out ?? `mempunk-export-${today}.json`);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8');

  const totalRows = TABLES.reduce((n, t) => n + data.tables[t].length, 0);
  console.log(t('export.created', { path: outPath, tables: TABLES.length, rows: totalRows }));
}
