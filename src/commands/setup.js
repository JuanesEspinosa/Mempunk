import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail } from '../lib/output.js';
import { VAULT_PATH, __cliDir } from '../lib/vault.js';
import { CLI_DEFS } from '../lib/cli-defs.js';
import { cmdInit } from './init.js';
import { cmdHooksInstall, cmdAutoStart } from './hooks.js';

// ── Handlers — Setup ──────────────────────────────────────────────────────────

const PLUGIN_INSTALL_COMMANDS = [
  'claude plugin marketplace add JuanesEspinosa/Mempunk',
  'claude plugin install mempunk@mempunk',
];

/**
 * Instala el plugin con el CLI de Claude Code. Ambos comandos son idempotentes.
 * Van por shell porque en Windows `claude` puede ser un shim .cmd; son cadenas fijas,
 * sin nada que citar. Si falla, el `hooks install` que sigue en cmdSetup deja los hooks manuales.
 */
function installPlugin() {
  for (const command of PLUGIN_INSTALL_COMMANDS) {
    const { status } = spawnSync(command, { stdio: 'inherit', shell: true });
    if (status !== 0) {
      console.log(t('setup.pluginFailed'));
      return;
    }
  }
  console.log(t('setup.pluginInstalled'));
}

/**
 * Copia vault-skills al directorio del vault.
 * Lanza si falta el origen: sin él, el modo Antigravity/opencode queda sin protocolos.
 */
export function installVaultSkills(
  srcDir  = path.join(__cliDir, '..', 'vault-skills'),
  destDir = path.join(VAULT_PATH, 'vault-skills'),
) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(t('setup.vaultSkillsMissing', { path: srcDir }));
  }
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    if (file.endsWith('.md')) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
  }
}

/**
 * Setup interactivo.
 * Modos válidos: 'auto' | 'manual' | 'vault-skills'
 *   auto         → Claude Code + hooks + agentes
 *   manual       → Claude Code + vault-skills (sin hooks)
 *   vault-skills → Antigravity / opencode + vault-skills (sin hooks)
 *
 * Pasa --setup-mode <modo> para saltear las preguntas (CI / tests).
 * --plugin implica 'auto' e instala el plugin de Claude Code en vez de los hooks manuales.
 */
export async function cmdSetup() {
  if (opts.plugin && (opts['setup-mode'] ?? 'auto') !== 'auto') {
    fail(t('setup.pluginRequiresAuto', { mode: opts['setup-mode'] }));
  }

  // ── Step 1: Vault ────────────────────────────────────────────────────────
  if (!fs.existsSync(VAULT_PATH)) {
    cmdInit();
    console.log(t('setup.vaultCreated', { path: VAULT_PATH }));
  } else {
    console.log(t('setup.vaultExists', { path: VAULT_PATH }));
  }

  // ── Step 2: Determinar modo ──────────────────────────────────────────────
  let mode = opts['setup-mode'] ?? (opts.plugin ? 'auto' : null);

  if (!mode) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log(t('setup.askCli'));
    console.log(t('setup.cliOption1'));
    console.log(t('setup.cliOption2'));
    const cliAnswer = (await rl.question(t('setup.choose'))).trim();
    const isClaudeCode = cliAnswer !== '2';

    if (isClaudeCode) {
      console.log(t('setup.askMode'));
      console.log(t('setup.modeOption1'));
      console.log(t('setup.modeOption1a'));
      console.log(t('setup.modeOption1b'));
      console.log(t('setup.modeOption2'));
      console.log(t('setup.modeOption2a'));
      const modeAnswer = (await rl.question(t('setup.choose'))).trim();
      mode = modeAnswer === '2' ? 'manual' : 'auto';
    } else {
      mode = 'vault-skills';
    }

    rl.close();
  }

  // Validar modo si vino por flag
  if (!['auto', 'manual', 'vault-skills'].includes(mode)) {
    fail(t('setup.invalidMode', { mode }));
  }

  // ── Step 3: Vincular vault a los CLIs correspondientes ───────────────────
  const normalized = VAULT_PATH.replace(/\\/g, '/');

  if (mode === 'auto' || mode === 'manual') {
    const added = CLI_DEFS['claude-code'].addDir(normalized);
    console.log(added ? t('setup.linked', { name: 'Claude Code' }) : t('setup.alreadyLinked', { name: 'Claude Code' }));
  } else {
    let anyLinked = false;
    for (const key of ['antigravity', 'opencode']) {
      const def = CLI_DEFS[key];
      if (def.isInstalled()) {
        const added = def.addDir(normalized);
        console.log(added ? t('setup.linked', { name: def.displayName }) : t('setup.alreadyLinked', { name: def.displayName }));
        anyLinked = true;
      }
    }
    if (!anyLinked) {
      console.log(t('setup.noCliDetected'));
      console.log(t('setup.noCliDetectedHint'));
    }
  }

  // ── Step 4: Instalar hooks+agentes o vault-skills ────────────────────────
  if (mode === 'auto') {
    if (opts.plugin) installPlugin();
    cmdHooksInstall();
    cmdAutoStart('on');
  } else {
    try {
      installVaultSkills();
    } catch (err) {
      fail(err.message);
    }
    console.log(t('setup.vaultSkills', { path: path.join(VAULT_PATH, 'vault-skills') }));
  }

  // ── Step 5: Guardar configuración de setup ───────────────────────────────
  const mempunkDir  = path.join(VAULT_PATH, '.mempunk');
  const setupConfig = {
    mode,
    cli: mode === 'vault-skills' ? 'other' : 'claude-code',
    created_at: new Date().toISOString(),
  };
  fs.mkdirSync(mempunkDir, { recursive: true });
  fs.writeFileSync(
    path.join(mempunkDir, 'setup.json'),
    JSON.stringify(setupConfig, null, 2) + '\n',
  );

  // ── Step 6: Resumen final ────────────────────────────────────────────────
  const line = '─'.repeat(52);
  console.log(`\n${line}`);
  console.log(t('setup.nextStep'));
  console.log(t('setup.nextStepCmd'));
  if (mode === 'auto') {
    console.log(t('setup.autoHint'));
  } else {
    const skillPath = path.join(VAULT_PATH, 'vault-skills', 'session-start.md');
    console.log(t('setup.manualHint'));
    console.log(t('setup.manualHintRead', { path: skillPath }));
  }
  if (mode !== 'auto') {
    console.log(t('setup.migrateHint'));
    console.log(t('setup.migrateHintCmd'));
  }
  console.log(t('setup.privacyHint'));
  console.log(`${line}\n`);
}
