// ── Servicio de estado — wiki/state.md ────────────────────────────────────────
//
// El estado compilado se reemplaza entero en cada escritura; la sección
// "Historial de estados anteriores" se conserva y recibe una línea con la
// fecha y el resumen del estado que se sustituye.

import fs from 'node:fs';
import path from 'node:path';
import { t } from '../lib/i18n.js';
import { requireProject, requireText } from './project.js';
import { HISTORY_HEADING_RE, MAX_STATE_CHARS, readState, stripStateHistory } from './context.js';

export const STATE_HISTORY_HEADING = '## Historial de estados anteriores';

const MAX_HISTORY_LINE_CHARS = 200;

/**
 * Reemplaza wiki/state.md de un proyecto conservando su historial.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, markdown: string, now?: Date }} input
 * @returns {{ file_path: string }}
 */
export function updateState(store, { projectId, markdown, now = new Date() }) {
  const project = requireProject(store, projectId);
  // Un historial incluido por el modelo se descarta: el del archivo es la fuente
  const body = stripStateHistory(requireText(markdown, 'markdown'));
  if (body.length > MAX_STATE_CHARS) {
    throw new Error(t('service.stateTooLong', { length: body.length, max: MAX_STATE_CHARS }));
  }

  const file     = path.join(project.path, 'wiki', 'state.md');
  const previous = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const summary  = summaryLine(readState(file));
  const entries  = [
    historyBody(previous),
    summary ? `- ${now.toISOString().slice(0, 10)} — ${summary}` : null,
  ].filter(Boolean).join('\n');

  const content = `${body}\n\n---\n\n${STATE_HISTORY_HEADING}\n${entries ? `\n${entries}\n` : ''}`;
  writeAtomic(file, content);
  store.trackFile(file);
  return { file_path: file };
}

/** Contenido existente bajo el encabezado de historial ('' si no hay) */
function historyBody(raw) {
  const match = HISTORY_HEADING_RE.exec(raw);
  return match ? raw.slice(match.index + match[0].length).trim() : '';
}

/** Primera línea de texto del estado (sin títulos, citas ni metadatos en negrita) */
function summaryLine(state) {
  if (!state) return null;
  const lines = state.split('\n').map((l) => l.trim()).filter(Boolean);
  const line  = lines.find((l) => !/^(#|>|\*\*|-{3,})/.test(l)) ?? lines[0]?.replace(/^#+\s*/, '');
  return line ? line.replace(/\s+/g, ' ').slice(0, MAX_HISTORY_LINE_CHARS) : null;
}

/** Archivo temporal + rename: un lector concurrente nunca ve un state.md a medias */
function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}
