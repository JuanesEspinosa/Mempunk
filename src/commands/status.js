import { VAULT_PATH, CLI_VERSION, requireVault, openStore } from '../lib/vault.js';
import { CLI_DEFS, cliFlag } from '../lib/cli-defs.js';
import { t } from '../lib/i18n.js';

// ── Handlers — Status ─────────────────────────────────────────────────────────

export function cmdStatus() {
  requireVault();
  const store = openStore();
  const projects = store.listProjects();
  const normalized = VAULT_PATH.replace(/\\/g, '/');

  console.log(`\nVault:     ${VAULT_PATH}`);
  console.log(`CLI:       v${CLI_VERSION}  |  Vault schema: v${store.getVaultVersion()}`);

  for (const [key, def] of Object.entries(CLI_DEFS)) {
    if (!def.isInstalled()) continue;
    const linked = def.getRegisteredDirs().includes(normalized);
    const hint   = linked ? t('status.linked') : t('status.notLinked', { flag: cliFlag(key) });
    console.log(`${def.displayName.padEnd(12)}: ${hint}`);
  }
  console.log(t('status.projects', { count: projects.length }));

  if (projects.length === 0) {
    console.log('\n' + t('status.none') + '\n');
    return;
  }

  console.log('');
  for (const proj of projects) {
    const pending    = store.listBacklog(proj.id, 'pending').length;
    const inProgress = store.listBacklog(proj.id, 'in_progress').length;
    const lastSess   = store.getLastSession(proj.id);
    const lastDate   = lastSess?.ended_at ? lastSess.ended_at.slice(0, 10) : '—';
    console.log(`  ${proj.id}  (${proj.name})`);
    console.log('    ' + t('status.backlogLine', { pending, inProgress, date: lastDate }));
  }
  console.log('');
}
