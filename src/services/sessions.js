// ── Servicio de sesiones ──────────────────────────────────────────────────────

import { requireProject, requireText } from './project.js';

/**
 * Registra una sesión de trabajo.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, summary: string, files?: string[] }} input
 * @returns {{ id: string }}
 */
export function logSession(store, { projectId, summary, files = [] }) {
  requireProject(store, projectId);
  const text  = requireText(summary, 'summary');
  const clean = files.map((f) => f.trim()).filter(Boolean);
  return { id: store.logSession(projectId, text, clean) };
}
