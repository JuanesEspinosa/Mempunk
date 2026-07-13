import { VAULT_PATH } from '../lib/vault.js';
import { t } from '../lib/i18n.js';
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
      console.log(t('link.linked', { name: def.displayName, path: normalized }));
      anyLinked = true;
    } else {
      console.log(t('link.alreadyLinked', { name: def.displayName }));
    }
  }
  if (anyLinked) console.log(t('link.restart'));
}

export function cmdUnlink() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  const clis = resolveCLIs();

  for (const key of clis) {
    const def = CLI_DEFS[key];
    const removed = def.removeDir(normalized);
    if (removed) {
      console.log(t('link.unlinked', { name: def.displayName }));
    } else {
      console.log(t('link.notLinked', { name: def.displayName }));
    }
  }
}

// ── Handlers — CLI list ───────────────────────────────────────────────────────

export function cmdCliList() {
  const normalized = VAULT_PATH.replace(/\\/g, '/');
  console.log('\n' + t('cliList.header') + '\n');

  for (const [key, def] of Object.entries(CLI_DEFS)) {
    const installed = def.isInstalled();
    const linked    = installed && def.getRegisteredDirs().includes(normalized);
    const bullet    = !installed ? '○' : linked ? '●' : '◐';
    const status    = !installed
      ? t('cliList.notInstalled')
      : linked
        ? t('cliList.linked')
        : t('cliList.notLinkedHint', { flag: cliFlag(key) });
    console.log(`  ${bullet} ${def.displayName}  ${status}`);
  }
  console.log('');
}
