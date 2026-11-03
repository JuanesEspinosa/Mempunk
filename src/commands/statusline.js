import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail } from '../lib/output.js';
import { __cliDir } from '../lib/vault.js';
import { CLAUDE_SETTINGS_PATH, readJsonFile, writeJsonFile } from '../lib/config-files.js';

// ── Handlers — Statusline ─────────────────────────────────────────────────────

// Un plugin no puede fijar statusLine: se instala aparte, también con el plugin activo
function statuslineDest() {
  return path.join(os.homedir(), '.mempunk', 'statusline.js');
}

const fwdSlash = (p) => p.replace(/\\/g, '/');

/** ¿El comando ejecuta nuestra statusline? Un wrapper del usuario que la mencione no cuenta. */
function isOwnCommand(command) {
  return (command ?? '').trim().replace(/"$/, '').endsWith(fwdSlash(statuslineDest()));
}

/** Copia src/statusline.js a ~/.mempunk y lo registra en settings.json.
 *  Sin `force` no pisa una statusline ajena: `hooks install` pasa force (su comportamiento de siempre). */
export function installStatusline({ force }) {
  const src = path.join(__cliDir, 'statusline.js');
  const dest = statuslineDest();
  if (!fs.existsSync(src)) return;

  const destFwd = fwdSlash(dest);
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  const currentCmd = settings.statusLine?.command ?? '';
  if (!force && currentCmd && !isOwnCommand(currentCmd)) {
    fail(t('statusline.foreign', { command: currentCmd }));
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  try { fs.chmodSync(dest, 0o755); } catch (_) {}
  // package.json ESM: sin él, Node <22.7 no acepta los import del statusline
  fs.writeFileSync(path.join(path.dirname(dest), 'package.json'), JSON.stringify({ type: 'module' }) + '\n');

  // Usa path completo de node y forward slashes para compatibilidad con bash en Windows.
  // Comillas: node puede vivir en una ruta con espacios (C:/Program Files/...)
  const newCommand = `"${fwdSlash(process.execPath)}" "${destFwd}"`;
  if (currentCmd !== newCommand) {
    writeJsonFile(CLAUDE_SETTINGS_PATH, { ...settings, statusLine: { type: 'command', command: newCommand } });
    console.log(t('hooks.statuslineConfigured', { path: CLAUDE_SETTINGS_PATH }));
  } else {
    console.log(t('hooks.statuslineUnchanged'));
  }
}

/** Quita el registro de settings.json (solo si es la de Mempunk) y el archivo copiado.
 *  Devuelve true si estaba registrada. */
export function uninstallStatusline() {
  const dest = statuslineDest();
  const settings = readJsonFile(CLAUDE_SETTINGS_PATH);
  const registered = isOwnCommand(settings.statusLine?.command);
  if (registered) {
    const { statusLine: _removed, ...rest } = settings;
    writeJsonFile(CLAUDE_SETTINGS_PATH, rest);
    console.log(t('hooks.statuslineUnregistered'));
  }
  try { fs.unlinkSync(dest); } catch (_) {}
  return registered;
}

export function cmdStatusline(subcommand) {
  switch (subcommand) {
    case 'install':
      installStatusline({ force: Boolean(opts.force) });
      break;
    case 'uninstall':
      if (!uninstallStatusline()) console.log(t('statusline.noneFound'));
      break;
    default:
      fail(t('cli.unknownSubcommand', { command: 'statusline', sub: subcommand ?? '', valid: 'install | uninstall' }));
  }
}
