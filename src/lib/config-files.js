import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fail } from './output.js';
import { t } from './i18n.js';

// ── Helpers — archivos de config ─────────────────────────────────────────────

export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

export function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  // Strip BOM: PowerShell y varios editores de Windows lo agregan y JSON.parse falla
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    // Nunca devolver {} ante un parse error: el caller reescribiría el archivo
    // completo y destruiría la configuración existente del usuario
    fail(t('config.parseError', { path: filePath, message: err.message }));
  }
}

export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
}

// Clave del plugin en enabledPlugins (<plugin>@<marketplace>)
const PLUGIN_KEY = 'mempunk@mempunk';

/** JSON de un archivo de Claude Code, o undefined si falta o está roto: la detección nunca aborta.
 *  trimStart quita también el BOM. */
function readJsonQuiet(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').trimStart());
  } catch (_) {
    return undefined;
  }
}

/** ¿Lo instaló Claude Code en esta máquina? La clave de enabledPlugins puede venir de un
 *  settings.json compartido (repo de equipo, dotfiles) sin que el plugin esté instalado. */
function isPluginInstalled(userDir) {
  const entries = readJsonQuiet(path.join(userDir, 'plugins', 'installed_plugins.json'))?.plugins?.[PLUGIN_KEY];
  return Array.isArray(entries) && entries.length > 0;
}

/** ¿Está activo el plugin de Mempunk? Instalado y habilitado, con la precedencia de Claude Code:
 *  settings.local.json y settings.json del proyecto antes que los del usuario (CLAUDE_CONFIG_DIR
 *  o ~/.claude). Ante la duda devuelve false: ejecutar dos veces es mejor que quedarse sin hooks.
 *  Duplicado a propósito en src/hooks-lib/common.js (los hooks no importan de src/lib). */
export function isPluginEnabled(projectDir = process.env.CLAUDE_PROJECT_DIR?.trim() || process.cwd()) {
  const userDir = process.env.CLAUDE_CONFIG_DIR?.trim() || path.join(os.homedir(), '.claude');
  if (!isPluginInstalled(userDir)) return false;
  const candidates = [
    path.join(projectDir, '.claude', 'settings.local.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(userDir, 'settings.json'),
  ];
  for (const file of candidates) {
    const flag = readJsonQuiet(file)?.enabledPlugins?.[PLUGIN_KEY];
    if (typeof flag === 'boolean') return flag;
  }
  return false;
}
