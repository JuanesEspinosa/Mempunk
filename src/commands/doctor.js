import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { VAULT_VERSION } from '../store/VaultStore.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import { CLI_DEFS, cliFlag } from '../lib/cli-defs.js';

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
  if (fs.existsSync(dbPath)) { ok('Base de datos encontrada'); }
  else { err('Base de datos no encontrada — ejecuta mempunk init'); }

  const store = openStore(true);
  const vaultVer = store.getVaultVersion();
  if (vaultVer < VAULT_VERSION) {
    warn(`Vault desactualizado (v${vaultVer} → v${VAULT_VERSION}) — ejecuta mempunk vault upgrade`);
  } else {
    ok(`Vault v${vaultVer} — actualizado`);
  }

  const projects = store.listProjects();
  ok(`${projects.length} proyecto(s) en BD`);

  for (const proj of projects) {
    const dir = path.join(VAULT_PATH, 'projects', proj.id);
    if (!fs.existsSync(dir)) {
      warn(`Proyecto "${proj.id}": directorio no encontrado en disco`);
    } else {
      if (!fs.existsSync(path.join(dir, 'decisions'))) warn(`Proyecto "${proj.id}": falta decisions/`);
      if (!fs.existsSync(path.join(dir, 'skills')))    warn(`Proyecto "${proj.id}": falta skills/`);
    }
  }

  const normalized = VAULT_PATH.replace(/\\/g, '/');
  for (const [key, def] of Object.entries(CLI_DEFS)) {
    if (!def.isInstalled()) continue;
    const linked = def.getRegisteredDirs().includes(normalized);
    if (linked) { ok(`Vault vinculado a ${def.displayName}`); }
    else { warn(`Vault no vinculado a ${def.displayName} — ejecuta mempunk link --cli ${cliFlag(key)}`); }
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

  if (globalHooksOk)     { ok('Hooks instalados (global)'); }
  else if (localHooksOk) { ok('Hooks instalados (local)'); }
  else { warn('Hooks no instalados — ejecuta mempunk hooks install'); }

  if (globalAgentsOk || localAgentsOk) { ok(`Agentes instalados (${globalAgentsOk ? 'global' : 'local'})`); }
  else { warn('Agentes no instalados — ejecuta mempunk hooks install'); }

  // Revisar hooks.log por errores recientes (últimas 50 líneas)
  const hooksLogPath = path.join(VAULT_PATH, '.mempunk', 'hooks.log');
  if (fs.existsSync(hooksLogPath)) {
    const logLines = fs.readFileSync(hooksLogPath, 'utf8').split('\n').filter(Boolean);
    const recentErrors = logLines.slice(-50).filter(l => l.includes(' Error'));
    if (recentErrors.length > 0) {
      warn(`hooks.log contiene ${recentErrors.length} error(es) reciente(s) — revisa: ${hooksLogPath}`);
      recentErrors.slice(-3).forEach(l => console.log(`    ${l}`));
    } else {
      ok('hooks.log sin errores recientes');
    }
  }

  // Verificar proyecto activo (.mempunk/active-project.json)
  const activeFile = path.join(VAULT_PATH, '.mempunk', 'active-project.json');
  if (fs.existsSync(activeFile)) {
    try {
      const { project_id } = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
      ok(`Proyecto activo: ${project_id}`);
    } catch (_) {
      warn('active-project.json existe pero no es JSON válido — ejecuta mempunk project activate <id>');
    }
  } else {
    // Tomar un proyecto real de la BD para el ejemplo; si no hay ninguno, usar uno inventado
    const exampleId = store.listProjects()[0]?.id ?? 'cuidado-gatos';
    warn(
      'Sin proyecto activo — los hooks no pueden guardar checkpoints\n' +
      `    Solución: mempunk project activate <id>\n` +
      `    Ejemplo:  mempunk project activate ${exampleId}`
    );
  }

  console.log('');
  if (issues === 0 && warnings === 0) {
    console.log('  ✓ Todo en orden\n');
  } else {
    if (issues   > 0) console.log(`  ✗ ${issues} error(s)`);
    if (warnings > 0) console.log(`  ! ${warnings} advertencia(s)`);
    console.log('');
  }
}
