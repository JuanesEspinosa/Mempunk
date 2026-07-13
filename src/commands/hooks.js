import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail } from '../lib/output.js';
import { VAULT_PATH, __cliDir } from '../lib/vault.js';
import { CLAUDE_SETTINGS_PATH, readJsonFile, writeJsonFile } from '../lib/config-files.js';

// ── Handlers — Hooks ──────────────────────────────────────────────────────────

// Archivos que Mempunk instala — el mismo orden se usa en install y uninstall
const HOOK_FILES  = ['on-start.js', 'on-compact.js', 'on-stop.js', 'on-prompt.js'];
const AGENT_FILES = ['mempunk-saver.md', 'mempunk-loader.md', 'mempunk-recover.md'];

// Identificadores únicos para distinguir archivos de Mempunk de otros del usuario
const HOOK_MARKER  = '# mempunk-hook';
const AGENT_MARKER = '# mempunk-agent';

// Mapeo hook file → evento de Claude Code
const HOOK_EVENT_MAP = {
  'on-start.js':   'SessionStart',
  'on-stop.js':    'Stop',
  'on-compact.js': 'PreCompact',
  'on-prompt.js':  'UserPromptSubmit',
};

// Flag file para auto-start — vive dentro del vault para ser aislable en tests
const AUTO_START_FLAG = path.join(VAULT_PATH, '.mempunk', 'auto-start.flag');

/** Devuelve el directorio destino de hooks. Global por defecto; --local para scope de proyecto. */
function hooksTargetDir() {
  return opts.local
    ? path.join(process.cwd(), '.claude', 'hooks')
    : path.join(os.homedir(), '.claude', 'hooks');
}

/** Devuelve el directorio destino de agentes. Global por defecto; --local para scope de proyecto. */
function agentsTargetDir() {
  return opts.local
    ? path.join(process.cwd(), '.claude', 'agents')
    : path.join(os.homedir(), '.claude', 'agents');
}

/** Registra hooks de Mempunk en settings.json como command hooks.
 *  Usa un string completo "node /path/hook.js" porque Claude Code ejecuta
 *  hooks via bash -c y el campo args[] se pasa como $0, no como argumento al
 *  ejecutable. Los paths se normalizan a forward slashes para compatibilidad
 *  con bash en Windows (process.execPath devuelve backslashes en Windows). */
/** True si la entrada `h` referencia el hook `file` de Mempunk dentro de alguno
 *  de los directorios `dirsFwd` (paths ya normalizados a forward slashes).
 *  Matchear por (directorio + nombre de archivo) evita borrar hooks de terceros
 *  cuyo path solo contenga el nombre del archivo o la palabra "mempunk". */
function _referencesMempunkHook(h, file, dirsFwd) {
  const fwd = (p) => (typeof p === 'string' ? p.replace(/\\/g, '/') : '');
  const target = Array.isArray(h.args) ? fwd(h.args[0]) : fwd(h.command);
  return dirsFwd.some((d) => target.includes(`${d}/${file}`));
}

/** Directorio donde Mempunk instaló hooks en versiones anteriores. */
function _legacyHooksDirFwd() {
  return path.join(os.homedir(), '.mempunk', 'hooks').replace(/\\/g, '/');
}

function _registerHooksInSettings(hooksDir) {
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  if (!settings.hooks) settings.hooks = {};

  // Normalizar backslashes → forward slashes para bash en Windows
  const fwd = (p) => p.replace(/\\/g, '/');
  const nodeExe = fwd(process.execPath);
  const knownDirsFwd = [fwd(hooksDir), _legacyHooksDirFwd()];

  // Limpiar entradas previas de Mempunk:
  //   - type:prompt (auto-start viejo)
  //   - registros del mismo script (dedupe si cambió la ruta de node)
  //   - registros apuntando a la ubicación legacy ~/.mempunk/hooks
  for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    settings.hooks[event] = settings.hooks[event].filter((g) => {
      if (!g.hooks) return true;
      const isMempunkHook = g.hooks.some(
        (h) => h.prompt?.includes('mempunk-auto-start') ||
               (h.type === 'command' && _referencesMempunkHook(h, file, knownDirsFwd))
      );
      return !isMempunkHook;
    });
  }

  for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
    const scriptPath = fwd(path.join(hooksDir, file));
    // Comillas: node puede vivir en una ruta con espacios (C:/Program Files/...)
    const commandStr = `"${nodeExe}" "${scriptPath}"`;

    if (!settings.hooks[event]) settings.hooks[event] = [];
    settings.hooks[event].push({
      matcher: '',
      hooks: [{ type: 'command', command: commandStr }],
    });
  }

  writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
}

/** Elimina de settings.json los hooks de Mempunk que apunten a `hooksDir`
 *  (o a la ubicación legacy ~/.mempunk/hooks). Registros de Mempunk en OTROS
 *  directorios (p.ej. global vs --local) y hooks de terceros no se tocan. */
function _unregisterHooksFromSettings(hooksDir) {
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  if (!settings.hooks) return;

  const fwd = (p) => p.replace(/\\/g, '/');
  const dirsFwd = [fwd(hooksDir), _legacyHooksDirFwd()];

  for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
    if (!Array.isArray(settings.hooks[event])) continue;
    settings.hooks[event] = settings.hooks[event].filter(
      (g) => !g.hooks?.some(
        (h) => h.prompt?.includes('mempunk-auto-start') ||
               (h.type === 'command' && _referencesMempunkHook(h, file, dirsFwd))
      )
    );
    if (settings.hooks[event].length === 0) delete settings.hooks[event];
  }

  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
}

export function cmdHooksInstall() {
  // Los hooks instalables son los bundles autocontenidos de dist/hooks
  // (src/hooks importa de hooks-lib y no funciona copiado suelto)
  const sourceDir = path.join(__cliDir, '..', 'dist', 'hooks');
  const targetDir = hooksTargetDir();

  // Verificar que los hooks fuente existen antes de proceder
  for (const file of HOOK_FILES) {
    if (!fs.existsSync(path.join(sourceDir, file))) {
      fail(t('hooks.bundleMissing', { path: path.join(sourceDir, file) }));
    }
  }

  // Modo --check: solo informar si están instalados, sin modificar nada
  if (opts.check) {
    const agentsDir    = agentsTargetDir();
    const hooksOk      = HOOK_FILES.filter((f) => fs.existsSync(path.join(targetDir, f)));
    const agentsOk     = AGENT_FILES.filter((f) => fs.existsSync(path.join(agentsDir, f)));

    console.log(t('hooks.checkHooksHeader', { dir: targetDir }));
    HOOK_FILES.forEach((f) => console.log(`  ${hooksOk.includes(f) ? '✓' : '✗'} ${f}`));

    // Un hook copiado pero no registrado en settings.json nunca corre:
    // verificar ambas cosas para que --check refleje el estado real
    const settings   = readJsonFile(CLAUDE_SETTINGS_PATH);
    const targetFwd  = targetDir.replace(/\\/g, '/');
    console.log(t('hooks.checkSettingsHeader', { path: CLAUDE_SETTINGS_PATH }));
    for (const [file, event] of Object.entries(HOOK_EVENT_MAP)) {
      const registered = Array.isArray(settings.hooks?.[event]) &&
        settings.hooks[event].some((g) => g.hooks?.some(
          (h) => h.type === 'command' && _referencesMempunkHook(h, file, [targetFwd])
        ));
      console.log(`  ${registered ? '✓' : '✗'} ${event} → ${file}`);
    }

    console.log(t('hooks.checkAgentsHeader', { dir: agentsDir }));
    AGENT_FILES.forEach((f) => console.log(`  ${agentsOk.includes(f) ? '✓' : '✗'} ${f}`));

    const statuslineOk = fs.existsSync(path.join(os.homedir(), '.mempunk', 'statusline.js'));
    console.log(`Statusline: ${statuslineOk ? '✓' : '✗'}`);
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  // package.json ESM necesario para que Node.js trate los hooks como módulos ESM
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify({ type: 'module' }) + '\n');

  for (const file of HOOK_FILES) {
    const dest = path.join(targetDir, file);
    fs.copyFileSync(path.join(sourceDir, file), dest);
    // Hacer ejecutable el script en sistemas Unix — en Windows no tiene efecto pero no falla
    try { fs.chmodSync(dest, 0o755); } catch (_) {}
  }

  // Registrar hooks en settings.json como command hooks
  _registerHooksInSettings(targetDir);

  // Instalar statusline: copiar src/statusline.js a ~/.mempunk/statusline.js
  const statuslineSrc  = path.join(__cliDir, 'statusline.js');
  const statuslineDest = path.join(os.homedir(), '.mempunk', 'statusline.js');
  if (fs.existsSync(statuslineSrc)) {
    fs.mkdirSync(path.dirname(statuslineDest), { recursive: true });
    fs.copyFileSync(statuslineSrc, statuslineDest);
    try { fs.chmodSync(statuslineDest, 0o755); } catch (_) {}
    // package.json ESM: sin él, Node <22.7 no acepta los import del statusline
    fs.writeFileSync(
      path.join(path.dirname(statuslineDest), 'package.json'),
      JSON.stringify({ type: 'module' }) + '\n'
    );

    // Registrar statusline en ~/.claude/settings.json
    // Usa path completo de node y forward slashes para compatibilidad con bash en Windows
    const fwdSlash   = (p) => p.replace(/\\/g, '/');
    const nodeExe    = fwdSlash(process.execPath);
    const destFwd    = fwdSlash(statuslineDest);
    // Comillas: node puede vivir en una ruta con espacios (C:/Program Files/...)
    const newCommand = `"${nodeExe}" "${destFwd}"`;

    const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
    const currentCmd = settings.statusLine?.command ?? '';
    if (currentCmd !== newCommand) {
      settings.statusLine = { type: 'command', command: newCommand };
      writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
      console.log(t('hooks.statuslineConfigured', { path: CLAUDE_SETTINGS_PATH }));
    } else {
      console.log(t('hooks.statuslineUnchanged'));
    }
  }

  // Instalar agentes: copiar src/agents/*.md a .claude/agents/ (local o global)
  const agentSrcDir  = path.join(__cliDir, 'agents');
  const agentDestDir = agentsTargetDir();

  if (fs.existsSync(agentSrcDir)) {
    fs.mkdirSync(agentDestDir, { recursive: true });
    for (const file of AGENT_FILES) {
      const src = path.join(agentSrcDir, file);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(agentDestDir, file));
    }
    console.log(t('hooks.agentsInstalled', { dir: agentDestDir }));
  }

  console.log(t('hooks.installed', { dir: targetDir }));
}

export function cmdHooksUninstall() {
  const targetDir = hooksTargetDir();

  let removed = 0;
  if (fs.existsSync(targetDir)) {
    for (const file of HOOK_FILES) {
      const filePath = path.join(targetDir, file);
      if (!fs.existsSync(filePath)) continue;

      // Solo eliminar hooks que contengan el marcador — no tocar otros hooks del usuario
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(HOOK_MARKER)) {
          fs.unlinkSync(filePath);
          removed++;
        }
      } catch (_) {}
    }

    // El package.json ESM lo escribió install: retirarlo si no quedan otros scripts,
    // para no dejar un directorio que "parece instalado" sin estarlo
    try {
      const remaining = fs.readdirSync(targetDir).filter((f) => f.endsWith('.js'));
      if (remaining.length === 0) fs.unlinkSync(path.join(targetDir, 'package.json'));
    } catch (_) {}
  }

  if (removed > 0) {
    console.log(t('hooks.removed', { dir: targetDir }));
  } else {
    console.log(t('hooks.noneFound', { dir: targetDir }));
  }

  // Eliminar agentes de Mempunk (solo los marcados con # mempunk-agent)
  const agentDir = agentsTargetDir();
  let agentsRemoved = 0;
  for (const file of AGENT_FILES) {
    const filePath = path.join(agentDir, file);
    if (!fs.existsSync(filePath)) continue;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes(AGENT_MARKER)) {
        fs.unlinkSync(filePath);
        agentsRemoved++;
      }
    } catch (_) {}
  }
  if (agentsRemoved > 0) console.log(t('hooks.agentsRemoved', { dir: agentDir }));

  // Statusline: solo el uninstall global lo retira (settings.json + archivo)
  if (!opts.local) {
    const statuslineDest = path.join(os.homedir(), '.mempunk', 'statusline.js');
    const destFwd = statuslineDest.replace(/\\/g, '/');
    const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
    if (settings.statusLine?.command?.includes(destFwd)) {
      delete settings.statusLine;
      writeJsonFile(CLAUDE_SETTINGS_PATH, settings);
      console.log(t('hooks.statuslineUnregistered'));
    }
    try { fs.unlinkSync(statuslineDest); } catch (_) {}
  }

  // Eliminar registros de settings.json — siempre, aunque el directorio no exista,
  // para no dejar entradas zombie apuntando a scripts borrados
  _unregisterHooksFromSettings(targetDir);
}

// ── Handlers — Auto-start ─────────────────────────────────────────────────────

// Auto-start se controla via flag file leído por on-start.js en cada SessionStart.
// No escribe en settings.json — los hooks ya están registrados por cmdHooksInstall.

export function cmdAutoStart(action) {
  const enabled = fs.existsSync(AUTO_START_FLAG);

  if (!action) {
    console.log(t('autostart.status', { state: enabled ? 'on' : 'off' }));
    return;
  }

  if (action === 'on') {
    if (enabled) { console.log(t('autostart.alreadyOn')); return; }

    // Advertir si los hooks no están instalados — on-start.js los necesita
    const globalHooksDir = path.join(os.homedir(), '.claude', 'hooks');
    if (!fs.existsSync(path.join(globalHooksDir, 'on-start.js'))) {
      process.stderr.write(t('autostart.requiresHooks'));
    }

    fs.mkdirSync(path.dirname(AUTO_START_FLAG), { recursive: true });
    fs.writeFileSync(AUTO_START_FLAG, '');
    console.log(t('autostart.enabled'));
  } else if (action === 'off') {
    if (!enabled) { console.log(t('autostart.alreadyOff')); return; }
    fs.unlinkSync(AUTO_START_FLAG);
    console.log(t('autostart.disabled'));
  } else {
    fail(t('autostart.unknownAction', { action }));
  }
}
