import { VAULT_PATH } from '../lib/vault.js';
import { CLI_DEFS, resolveCLIs, cliFlag } from '../lib/cli-defs.js';

// ── Handlers — Link / Unlink ──────────────────────────────────────────────────

export function cmdLink() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  const clis = resolveCLIs();
  let anyLinked = false;

  for (const key of clis) {
    const def = CLI_DEFS[key];
    const added = def.addDir(normalized);
    if (added) {
      console.log(`Vault vinculado a ${def.displayName}: ${normalized}`);
      anyLinked = true;
    } else {
      console.log(`Vault ya vinculado a ${def.displayName}`);
    }
  }
  if (anyLinked) console.log('Reinicia los CLIs para aplicar el cambio.');
}

export function cmdUnlink() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  const clis = resolveCLIs();

  for (const key of clis) {
    const def = CLI_DEFS[key];
    const removed = def.removeDir(normalized);
    if (removed) {
      console.log(`Vault desvinculado de ${def.displayName}`);
    } else {
      console.log(`Vault no estaba vinculado a ${def.displayName}`);
    }
  }
}

// ── Handlers — CLI list ───────────────────────────────────────────────────────

export function cmdCliList() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  console.log('\nCLIs compatibles con Mempunk:\n');

  for (const [key, def] of Object.entries(CLI_DEFS)) {
    const installed = def.isInstalled();
    const linked    = installed && def.getRegisteredDirs().includes(normalized);
    const bullet    = !installed ? '○' : linked ? '●' : '◐';
    const status    = !installed
      ? '(no instalado)'
      : linked
        ? '(vinculado)'
        : `(no vinculado — mempunk link --cli ${cliFlag(key)})`;
    console.log(`  ${bullet} ${def.displayName}  ${status}`);
  }
  console.log('');
}
