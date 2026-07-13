import { createInterface } from 'node:readline/promises';
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

/** Copia vault-skills al directorio del vault */
function _installVaultSkills() {
  const srcDir  = path.join(__cliDir, '..', 'vault-skills');
  const destDir = path.join(VAULT_PATH, 'vault-skills');
  if (!fs.existsSync(srcDir)) return;
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
 *   vault-skills → Gemini / opencode + vault-skills (sin hooks)
 *
 * Pasa --setup-mode <modo> para saltear las preguntas (CI / tests).
 */
export async function cmdSetup() {
  // ── Step 1: Vault ────────────────────────────────────────────────────────
  if (!fs.existsSync(VAULT_PATH)) {
    cmdInit();
    console.log(t('setup.vaultCreated', { path: VAULT_PATH }));
  } else {
    console.log(t('setup.vaultExists', { path: VAULT_PATH }));
  }

  // ── Step 2: Determinar modo ──────────────────────────────────────────────
  let mode = opts['setup-mode'] ?? null;

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
    for (const key of ['gemini-cli', 'opencode']) {
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
    cmdHooksInstall();
    cmdAutoStart('on');
  } else {
    _installVaultSkills();
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
  console.log(`${line}\n`);
}
