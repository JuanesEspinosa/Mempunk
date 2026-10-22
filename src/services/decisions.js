// ── Servicio de decisiones (ADR) ──────────────────────────────────────────────

import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { requireProject, requireText } from './project.js';

/**
 * Crea un ADR: escribe el markdown en projects/<id>/decisions/ y lo registra
 * en SQLite + índice FTS (de forma atómica, ver VaultStore.addDecision).
 *
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, title: string, context?: string, decision?: string,
 *           consequences?: string, tags?: string[] }} input
 * @returns {{ id: string, file_path: string }}
 */
export function addDecision(store, { projectId, title, context = '', decision = '', consequences = '', tags = [] }) {
  const project   = requireProject(store, projectId);
  const cleanTitle = requireText(title, 'title');
  const cleanTags  = tags.map((tag) => tag.trim()).filter(Boolean);
  const now        = new Date().toISOString();
  // Sufijo aleatorio: dos sesiones MCP pueden guardar en el mismo milisegundo
  // y el segundo archivo pisaría al primero
  const suffix     = randomBytes(3).toString('hex');
  const filePath   = path.join(project.path, 'decisions', `${projectId}-decision-${Date.now()}-${suffix}.md`);

  const content = [
    '---',
    `title: ${cleanTitle}`,
    `tags: [${cleanTags.join(', ')}]`,
    `created_at: ${now}`,
    '---',
    '',
    `# ${cleanTitle}`,
    '',
    ...section('Contexto', context),
    ...section('Decisión', decision),
    ...section('Consecuencias', consequences),
  ].join('\n');

  const id = store.addDecision(projectId, cleanTitle, filePath, cleanTags, content);
  return { id, file_path: filePath };
}

/** Sección del ADR: título, línea en blanco y, si hay, el cuerpo seguido de otra línea en blanco */
function section(title, body) {
  const text = body.trim();
  return text ? [`## ${title}`, '', text, ''] : [`## ${title}`, ''];
}
