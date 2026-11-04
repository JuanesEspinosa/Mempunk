// ── Servicio de estado — wiki/state.md ────────────────────────────────────────
//
// El estado compilado se reemplaza entero en cada escritura; la sección
// "Historial de estados anteriores" se conserva y recibe una línea con la
// fecha y el resumen del estado que se sustituye.

import fs from 'node:fs';
import path from 'node:path';
import { t } from '../lib/i18n.js';
import { redactSecrets } from '../hooks-lib/redact.js';
import { requireProject, requireText } from './project.js';
import { HISTORY_HEADING_RE, MAX_STATE_CHARS, readState, stripStateHistory } from './context.js';

export const STATE_HISTORY_HEADING = '## Historial de estados anteriores';

const MAX_HISTORY_LINE_CHARS = 200;

// Las de templates/project/wiki/state.md. Solo se avisa: un estado incompleto
// sigue valiendo más que perder lo que el modelo quería guardar
export const STATE_SECTIONS = [
  'Estado actual',
  'Que se esta construyendo ahora',
  'Decisiones vigentes clave',
  'Blockers / riesgos activos',
  'Proximos 3 pasos',
];

/**
 * Reemplaza wiki/state.md de un proyecto conservando su historial.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, markdown: string, now?: Date }} input
 * @returns {{ file_path: string, missing_sections: string[], warning?: string }}
 */
export function updateState(store, { projectId, markdown, now = new Date() }) {
  const project = requireProject(store, projectId);
  // Un historial incluido por el modelo se descarta: el del archivo es la fuente
  const body = stripStateHistory(redactSecrets(requireText(markdown, 'markdown')));
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

  const missing = missingSections(body);
  return {
    file_path: file,
    missing_sections: missing,
    ...(missing.length > 0 && { warning: t('service.stateMissingSections', { sections: missing.join(', ') }) }),
  };
}

/** Sin acentos, en minúsculas y con los espacios colapsados, para cotejar encabezados */
function normalizeHeading(text) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Secciones de STATE_SECTIONS sin encabezado `##` en el markdown */
function missingSections(markdown) {
  const headings = new Set(
    markdown.split('\n').filter((line) => line.startsWith('## ')).map((line) => normalizeHeading(line.slice(3))),
  );
  return STATE_SECTIONS.filter((section) => !headings.has(normalizeHeading(section)));
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

/** Archivo temporal + rename: un lector concurrente nunca ve un state.md a medias.
 *  En Windows el rename falla con EPERM/EBUSY mientras otro proceso (Obsidian,
 *  antivirus, indexador) tiene state.md abierto: se reintenta, y si no se logra
 *  se borra el temporal para que no acabe subido al remote con el push. */
function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    renameWithRetry(tmp, file);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* ya no existe */ }
    throw err;
  }
}

const RENAME_ATTEMPTS = 5;
const RENAME_DELAY_MS = 50;
const RETRYABLE_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

function renameWithRetry(from, to) {
  for (let attempt = 1; ; attempt++) {
    try {
      return fs.renameSync(from, to);
    } catch (err) {
      if (attempt >= RENAME_ATTEMPTS || !RETRYABLE_CODES.has(err.code)) throw err;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RENAME_DELAY_MS);
    }
  }
}
