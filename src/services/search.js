// ── Servicio de búsqueda full-text ────────────────────────────────────────────

import { requireProject, requireText } from './project.js';

export const DEFAULT_SEARCH_LIMIT = 20;

/**
 * Busca en el índice FTS5 (decisiones, resources y logs diarios).
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ query: string, projectId?: string|null, limit?: number }} input
 * @returns {{ item_id: string, project_id: string, type: string, file_path: string|null, snippet: string }[]}
 */
export function query(store, { query: text, projectId = null, limit = DEFAULT_SEARCH_LIMIT }) {
  const clean = requireText(text, 'query');
  if (projectId) requireProject(store, projectId);
  return store.search(clean, projectId).slice(0, limit);
}
