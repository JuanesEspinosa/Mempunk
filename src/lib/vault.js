import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import VaultStore, { VAULT_VERSION } from '../store/VaultStore.js';
import { fail } from './output.js';

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
    fail(`El vault no existe en ${VAULT_PATH}. Ejecuta "mempunk init" primero.`);
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
  const store = new VaultStore(VAULT_PATH, { autoMigrate: false });
  const vaultVersion = store.getVaultVersion();

  // Bootstrap: una BD recién creada no es una migración pendiente, es un vault nuevo
  if (vaultVersion === 0) {
    store.migrate();
    return store;
  }

  if (!skipVersionCheck && vaultVersion < VAULT_VERSION) {
    fail(`Vault desactualizado (v${vaultVersion} → v${VAULT_VERSION}). Ejecuta mempunk vault upgrade.`);
  }
  return store;
}
