// ── Servicio de contexto — bloque MEMPUNK CONTEXT ─────────────────────────────
//
// Compila el estado de un proyecto en un bloque de texto para inyectarlo en el
// contexto del modelo (restauración tras compactar, auto-start, get_context).
// Funciones puras sobre el store: devuelven datos y nunca imprimen.

import fs from 'node:fs';
import path from 'node:path';
import { t } from '../lib/i18n.js';

// Por debajo del límite de additionalContext de SessionStart (10.000)
export const DEFAULT_MAX_CHARS = 9000;

export const MAX_STATE_CHARS = 4000;  // mismo tope que valida update_state (services/state.js)
const MAX_BACKLOG           = 8;
const MAX_DECISIONS         = 5;
const MAX_SESSION_FILES     = 20;
const MAX_SNAPSHOT_FILES    = 20;
const MAX_SNAPSHOT_COMMANDS = 10;
const MAX_SNAPSHOT_MESSAGES = 6;
const MAX_MESSAGE_CHARS     = 200;

export const HISTORY_HEADING_RE =/^##\s+Historial de estados anteriores\s*$/m;

// Línea de relleno de templates/project/wiki/state.md: si sigue ahí, nadie
// escribió el estado todavía
const TEMPLATE_PLACEHOLDER = '[Una o dos lineas describiendo';

const TRUNCATED_MARK = '\n…';

/**
 * Lee wiki/state.md sin la sección de historial.
 * @param {string} file - Ruta absoluta de state.md
 * @returns {string|null} null si no existe, está vacío o es la plantilla sin rellenar
 */
export function readState(file) {
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, 'utf8');
  if (raw.includes(TEMPLATE_PLACEHOLDER)) return null;
  return stripStateHistory(raw) || null;
}

/** Parte de state.md anterior a la sección de historial, sin el separador `---` final */
export function stripStateHistory(raw) {
  const match = HISTORY_HEADING_RE.exec(raw);
  return (match ? raw.slice(0, match.index) : raw).replace(/\n-{3,}\s*$/, '').trim();
}

/**
 * Construye el bloque MEMPUNK CONTEXT de un proyecto.
 * Prioridad: estado → última sesión → backlog pendiente → decisiones → snapshot.
 * Si no cabe en maxChars se omiten secciones enteras desde el final; el estado
 * se trunca antes que perderse.
 *
 * @param {import('../store/VaultStore.js').default} store
 * @param {string} projectId
 * @param {{ maxChars?: number, withSnapshot?: boolean }} [options]
 * @returns {{ project_id: string, text: string, sections: {key: string, title: string, body: string}[],
 *             omitted: string[], truncated: boolean }}
 */
export function buildContext(store, projectId, { maxChars = DEFAULT_MAX_CHARS, withSnapshot = false } = {}) {
  const project = store.listProjects().find((p) => p.id === projectId);
  if (!project) throw new Error(t('context.unknownProject', { id: projectId }));

  const header   = `MEMPUNK CONTEXT — ${projectId}`;
  const sections = [
    stateSection(project),
    lastSessionSection(store, projectId),
    backlogSection(store, projectId),
    decisionsSection(store, projectId),
    withSnapshot ? snapshotSection(store, projectId) : null,
  ].filter(Boolean);

  return fitSections(projectId, header, sections, maxChars);
}

// ── Secciones ─────────────────────────────────────────────────────────────────

function stateSection(project) {
  const state = readState(path.join(project.path, 'wiki', 'state.md'));
  if (!state) return null;
  return { key: 'state', title: t('context.state'), body: truncate(state, MAX_STATE_CHARS) };
}

function lastSessionSection(store, projectId) {
  const session = store.getLastSession(projectId);
  if (!session) return null;
  const lines = [session.summary];
  const files = parseJsonArray(session.files_touched).slice(0, MAX_SESSION_FILES);
  if (files.length > 0) lines.push(t('context.files', { files: files.join(', ') }));
  return { key: 'lastSession', title: t('context.lastSession', { date: session.ended_at }), body: lines.join('\n') };
}

function backlogSection(store, projectId) {
  const items = store.listBacklog(projectId, 'pending').slice(0, MAX_BACKLOG);
  if (items.length === 0) return null;
  const body = items.map((i) => `- [P${i.priority}] ${i.title} (${i.id})`).join('\n');
  return { key: 'backlog', title: t('context.backlog'), body };
}

function decisionsSection(store, projectId) {
  const decisions = store.listDecisions(projectId).slice(0, MAX_DECISIONS);
  if (decisions.length === 0) return null;
  const body = decisions.map((d) => `- ${String(d.created_at).slice(0, 10)} — ${d.title}`).join('\n');
  return { key: 'decisions', title: t('context.decisions'), body };
}

function snapshotSection(store, projectId) {
  const snapshot = store.getLastCompactSnapshot(projectId);
  if (!snapshot) return null;

  const lines    = [];
  const files    = parseJsonArray(snapshot.files_found).slice(0, MAX_SNAPSHOT_FILES);
  const commands = parseJsonArray(snapshot.commands_run).slice(0, MAX_SNAPSHOT_COMMANDS);
  const messages = parseJsonArray(snapshot.raw_turns)
    .slice(-MAX_SNAPSHOT_MESSAGES)
    .map(formatTurn)
    .filter(Boolean);

  if (files.length > 0)    lines.push(t('context.files', { files: files.join(', ') }));
  if (commands.length > 0) lines.push(t('context.commands'), ...commands.map((c) => `  - ${c}`));
  if (messages.length > 0) lines.push(t('context.messages'), ...messages);
  if (lines.length === 0) return null;

  return { key: 'snapshot', title: t('context.snapshot', { date: snapshot.created_at }), body: lines.join('\n') };
}

// ── Ensamblado ────────────────────────────────────────────────────────────────

function render(header, sections) {
  return [header, ...sections.map((s) => `## ${s.title}\n${s.body}`)].join('\n\n');
}

function fitSections(projectId, header, sections, maxChars) {
  const kept    = [...sections];
  const omitted = [];
  if (kept.length === 0) {
    const text = `${header}\n\n${t('context.empty')}`.slice(0, maxChars);
    return { project_id: projectId, text, sections: [], omitted, truncated: false };
  }

  while (kept.length > 1 && render(header, kept).length > maxChars) {
    omitted.unshift(kept.pop().key);
  }

  let truncated = false;
  const overflow = render(header, kept).length - maxChars;
  if (overflow > 0) {
    const [first] = kept;
    const budget  = Math.max(0, first.body.length - overflow - TRUNCATED_MARK.length);
    kept[0]   = { ...first, body: first.body.slice(0, budget) + TRUNCATED_MARK };
    truncated = true;
  }

  // Red de seguridad para maxChars diminutos: el header y el título no se recortan arriba
  const text = render(header, kept).slice(0, maxChars);
  return { project_id: projectId, text, sections: kept, omitted, truncated };
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function truncate(text, max) {
  return text.length > max ? text.slice(0, max - TRUNCATED_MARK.length) + TRUNCATED_MARK : text;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/** Una línea por turno del transcript: `[user] …` / `[assistant] …` */
function formatTurn(turn) {
  const role    = turn?.type === 'user' || turn?.message?.role === 'user' ? 'user' : 'assistant';
  const content = turn?.message?.content;
  const text    = typeof content === 'string'
    ? content
    : Array.isArray(content) ? content.find((b) => b?.type === 'text')?.text ?? '' : '';
  const line = text.replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_CHARS);
  return line ? `  [${role}] ${line}` : null;
}
