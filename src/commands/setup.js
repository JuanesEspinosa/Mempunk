import { createInterface } from 'node:readline/promises';
import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
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
    console.log(`✓ Vault creado en ${VAULT_PATH}`);
  } else {
    console.log(`✓ Vault existente en ${VAULT_PATH}`);
  }

  // ── Step 2: Determinar modo ──────────────────────────────────────────────
  let mode = opts['setup-mode'] ?? null;

  if (!mode) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n¿Qué AI CLI usas principalmente?');
    console.log('  1. Claude Code');
    console.log('  2. Gemini CLI / opencode / otra\n');
    const cliAnswer = (await rl.question('Elige (1 o 2): ')).trim();
    const isClaudeCode = cliAnswer !== '2';

    if (isClaudeCode) {
      console.log('\n¿Cómo quieres que funcione Mempunk?');
      console.log('  1. Automático — hooks + agentes  (recomendado)');
      console.log('     Los hooks guardan checkpoints solos y @mempunk-loader');
      console.log('     carga el contexto al inicio de cada sesión.');
      console.log('  2. Manual — solo vault-skills');
      console.log('     Corres los protocolos tú mismo al inicio/fin de sesión.\n');
      const modeAnswer = (await rl.question('Elige (1 o 2): ')).trim();
      mode = modeAnswer === '2' ? 'manual' : 'auto';
    } else {
      mode = 'vault-skills';
    }

    rl.close();
  }

  // Validar modo si vino por flag
  if (!['auto', 'manual', 'vault-skills'].includes(mode)) {
    fail(`--setup-mode inválido: "${mode}". Usa: auto | manual | vault-skills`);
  }

  // ── Step 3: Vincular vault a los CLIs correspondientes ───────────────────
  const normalized = VAULT_PATH.replace(/\\/g, '/');

  if (mode === 'auto' || mode === 'manual') {
    const added = CLI_DEFS['claude-code'].addDir(normalized);
    console.log(`✓ Vault ${added ? 'vinculado' : 'ya vinculado'} a Claude Code`);
  } else {
    let anyLinked = false;
    for (const key of ['gemini-cli', 'opencode']) {
      const def = CLI_DEFS[key];
      if (def.isInstalled()) {
        const added = def.addDir(normalized);
        console.log(`✓ Vault ${added ? 'vinculado' : 'ya vinculado'} a ${def.displayName}`);
        anyLinked = true;
      }
    }
    if (!anyLinked) {
      console.log('! No se detectó Gemini CLI ni opencode instalados. Vincula manualmente con:');
      console.log('    mempunk link --cli gemini   (o opencode)');
    }
  }

  // ── Step 4: Instalar hooks+agentes o vault-skills ────────────────────────
  if (mode === 'auto') {
    cmdHooksInstall();
    cmdAutoStart('on');
  } else {
    _installVaultSkills();
    console.log(`✓ vault-skills instalados en ${path.join(VAULT_PATH, 'vault-skills')}`);
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
  console.log('Próximo paso:');
  console.log('  mempunk project add <id> "<nombre del proyecto>"');
  if (mode === 'auto') {
    console.log('\nAl iniciar Claude Code: @mempunk-loader se ejecuta automáticamente.');
  } else {
    const skillPath = path.join(VAULT_PATH, 'vault-skills', 'session-start.md');
    console.log('\nPara cargar contexto al inicio de sesión:');
    console.log(`  Lee ${skillPath}`);
  }
  if (mode !== 'auto') {
    console.log('\nSi migras a Claude Code en el futuro:');
    console.log('  mempunk setup --setup-mode auto');
  }
  console.log(`${line}\n`);
}
