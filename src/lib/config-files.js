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
