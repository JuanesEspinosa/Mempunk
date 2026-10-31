import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import VaultStore, { VAULT_VERSION } from '../store/VaultStore.js';
import { fail } from './output.js';
import { t } from './i18n.js';

// Versión semántica del paquete — leída desde package.json en tiempo de ejecución
const _require = createRequire(import.meta.url);
export const CLI_VERSION = _require('../../package.json').version;

// Directorio donde reside cli.js (src/) — necesario para localizar los hooks fuente.
// Este módulo vive en src/lib/, por eso se resuelve un nivel arriba.
export const __cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Ruta del vault — MEMPUNK_VAULT permite apuntar a un vault alternativo (usado en tests).
// `|| default` (no ??): un MEMPUNK_VAULT vacío haría que init cree el vault en el cwd
export const VAULT_PATH = process.env.MEMPUNK_VAULT?.trim() || path.join(os.homedir(), 'Dev-Brain');

// ── Guard de vault ────────────────────────────────────────────────────────────

/** Aborta si el vault no está inicializado */
export function requireVault() {
  if (!fs.existsSync(VAULT_PATH)) {
    fail(t('vault.notInitialized', { path: VAULT_PATH }));
  }
}

/**
 * Abre una instancia de VaultStore apuntando al vault SIN migrar en silencio.
 * - Vault nuevo (versión 0): se hace bootstrap del schema completo.
 * - Vault desactualizado: aborta pidiendo `mempunk vault upgrade` — las
 *   migraciones solo corren cuando el usuario lo decide explícitamente.
 * @param {boolean} skipVersionCheck - true en vault version/upgrade, que gestionan la versión ellos mismos
 */
export function openStore(skipVersionCheck = false) {
  try {
    return openStoreOrThrow(skipVersionCheck);
  } catch (err) {
    return fail(err.message);
  }
}

/**
 * Igual que openStore() pero lanza en vez de terminar el proceso: para
 * procesos de larga vida (`mempunk mcp`), donde un vault desactualizado debe
 * ser un error de la llamada y no la muerte del servidor.
 * @param {boolean} skipVersionCheck
 */
export function openStoreOrThrow(skipVersionCheck = false) {
  const store = new VaultStore(VAULT_PATH, { autoMigrate: false });
  const vaultVersion = store.getVaultVersion();

  // Bootstrap: una BD recién creada no es una migración pendiente, es un vault nuevo
  if (vaultVersion === 0) {
    store.migrate();
    return store;
  }

  if (!skipVersionCheck) {
    const problem = versionProblem(vaultVersion);
    if (problem) {
      store.db.close();
      throw new Error(problem);
    }
  }
  return store;
}

/**
 * Mensaje de error si el vault no está en la versión que entiende este CLI, o null.
 * - Más nuevo (migrado en otra máquina): escribir podría corromperlo.
 * - Más viejo: hace falta `mempunk vault upgrade`; nunca se migra en silencio.
 * @param {number} vaultVersion
 */
export function versionProblem(vaultVersion) {
  if (vaultVersion > VAULT_VERSION) return t('vault.newer', { current: vaultVersion, supported: VAULT_VERSION });
  if (vaultVersion < VAULT_VERSION) return t('vault.outdated', { current: vaultVersion, required: VAULT_VERSION });
  return null;
}
