// ── Servicio de sesiones ──────────────────────────────────────────────────────

import { t } from '../lib/i18n.js';
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

/**
 * Registro de sesión automático del hook SessionEnd: cede ante un registro
 * del agente posterior a `since` (ver VaultStore#logAutoSession).
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, summary: string, files?: string[], since: string }} input
 * @returns {{ id: string, action: 'merged' | 'updated' | 'inserted' }}
 */
export function logAutoSession(store, { projectId, summary, files = [], since }) {
  requireProject(store, projectId);
  const text = requireText(summary, 'summary');
  if (typeof since !== 'string' || Number.isNaN(Date.parse(since))) {
    throw new Error(t('service.invalidDate', { field: 'since', value: JSON.stringify(since) }));
  }
  const clean = files.filter((f) => typeof f === 'string').map((f) => f.trim()).filter(Boolean);
  return store.logAutoSession(projectId, { summary: text, files: clean, since: new Date(since).toISOString() });
}
