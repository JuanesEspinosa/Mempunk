import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VAULT_VERSION } from '../store/VaultStore.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import { CLI_DEFS, cliFlag } from '../lib/cli-defs.js';
import { t } from '../lib/i18n.js';

// ── Handlers — Doctor ─────────────────────────────────────────────────────────

export function cmdDoctor() {
  requireVault();

  let issues   = 0;
  let warnings = 0;
  const ok   = (msg) => console.log(`  ✓ ${msg}`);
  const warn = (msg) => { console.log(`  ! ${msg}`); warnings++; };
  const err  = (msg) => { console.log(`  ✗ ${msg}`); issues++; };

  console.log(`\nVault: ${VAULT_PATH}\n`);

  const dbPath = path.join(VAULT_PATH, '.mempunk', 'mempunk.db');
  if (fs.existsSync(dbPath)) { ok(t('doctor.dbFound')); }
  else { err(t('doctor.dbMissing')); }

  const store = openStore(true);
  const vaultVer = store.getVaultVersion();
  if (vaultVer < VAULT_VERSION) {
    warn(t('doctor.outdated', { current: vaultVer, required: VAULT_VERSION }));
  } else {
    ok(t('doctor.upToDate', { version: vaultVer }));
  }

  const projects = store.listProjects();
  ok(t('doctor.projectCount', { count: projects.length }));

  for (const proj of projects) {
    const dir = path.join(VAULT_PATH, 'projects', proj.id);
    if (!fs.existsSync(dir)) {
      warn(t('doctor.dirMissing', { id: proj.id }));
    } else {
      if (!fs.existsSync(path.join(dir, 'decisions'))) warn(t('doctor.missingDecisions', { id: proj.id }));
      if (!fs.existsSync(path.join(dir, 'skills')))    warn(t('doctor.missingSkills', { id: proj.id }));
    }
  }

  const normalized = VAULT_PATH.replace(/\\/g, '/');
  for (const [key, def] of Object.entries(CLI_DEFS)) {
    if (!def.isInstalled()) continue;
    const linked = def.getRegisteredDirs().includes(normalized);
    if (linked) { ok(t('doctor.linked', { name: def.displayName })); }
    else { warn(t('doctor.notLinked', { name: def.displayName, flag: cliFlag(key) })); }
  }

  const HOOK_FILES_DOC  = ['on-start.js', 'on-compact.js', 'on-stop.js', 'on-prompt.js'];
  const AGENT_FILES_DOC = ['mempunk-saver.md', 'mempunk-loader.md', 'mempunk-recover.md'];
  const globalHooksDir  = path.join(os.homedir(), '.claude', 'hooks');
  const localHooksDir   = path.join(process.cwd(), '.claude', 'hooks');
  const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');
  const localAgentsDir  = path.join(process.cwd(), '.claude', 'agents');

  const globalHooksOk  = HOOK_FILES_DOC.every(f => fs.existsSync(path.join(globalHooksDir, f)));
  const localHooksOk   = HOOK_FILES_DOC.every(f => fs.existsSync(path.join(localHooksDir, f)));
  const globalAgentsOk = AGENT_FILES_DOC.every(f => fs.existsSync(path.join(globalAgentsDir, f)));
  const localAgentsOk  = AGENT_FILES_DOC.every(f => fs.existsSync(path.join(localAgentsDir, f)));

  if (globalHooksOk)     { ok(t('doctor.hooksInstalled', { scope: 'global' })); }
  else if (localHooksOk) { ok(t('doctor.hooksInstalled', { scope: 'local' })); }
  else { warn(t('doctor.hooksMissing')); }

  if (globalAgentsOk || localAgentsOk) { ok(t('doctor.agentsInstalled', { scope: globalAgentsOk ? 'global' : 'local' })); }
  else { warn(t('doctor.agentsMissing')); }

  // Revisar hooks.log por errores recientes (últimas 50 líneas)
  const hooksLogPath = path.join(VAULT_PATH, '.mempunk', 'hooks.log');
  if (fs.existsSync(hooksLogPath)) {
    const logLines = fs.readFileSync(hooksLogPath, 'utf8').split('\n').filter(Boolean);
    const recentErrors = logLines.slice(-50).filter(l => l.includes(' Error'));
    if (recentErrors.length > 0) {
      warn(t('doctor.logErrors', { count: recentErrors.length, path: hooksLogPath }));
      recentErrors.slice(-3).forEach(l => console.log(`    ${l}`));
    } else {
      ok(t('doctor.logOk'));
    }
  }

  // Verificar proyecto activo (.mempunk/active-project.json)
  const activeFile = path.join(VAULT_PATH, '.mempunk', 'active-project.json');
  if (fs.existsSync(activeFile)) {
    try {
      const { project_id } = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      ok(t('project.active', { id: project_id }));
    } catch (_) {
      warn(t('doctor.activeInvalid'));
    }
  } else {
    // Tomar un proyecto real de la BD para el ejemplo; si no hay ninguno, usar uno inventado
    const exampleId = store.listProjects()[0]?.id ?? 'cuidado-gatos';
    warn(t('doctor.noActive', { example: exampleId }));
  }

  console.log('');
  if (issues === 0 && warnings === 0) {
    console.log(`  ✓ ${t('doctor.allGood')}\n`);
  } else {
    if (issues   > 0) console.log(`  ✗ ${t('doctor.errorCount', { count: issues })}`);
    if (warnings > 0) console.log(`  ! ${t('doctor.warningCount', { count: warnings })}`);
    console.log('');
  }
}
