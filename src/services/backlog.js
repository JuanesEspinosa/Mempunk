// ── Servicio de backlog ───────────────────────────────────────────────────────

import { t } from '../lib/i18n.js';
import { requireProject, requireText } from './project.js';

// Los vaults reales usan también blocked/cancelled y prioridades hasta 5
export const BACKLOG_STATUSES = ['pending', 'in_progress', 'done', 'blocked', 'cancelled'];
export const MIN_PRIORITY     = 1;
export const MAX_PRIORITY     = 5;
const DEFAULT_PRIORITY        = 2;

/**
 * Crea una tarea pendiente y la devuelve.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, title: string, priority?: number }} input
 */
export function addItem(store, { projectId, title, priority = DEFAULT_PRIORITY }) {
  requireProject(store, projectId);
  const id = store.addBacklogItem(projectId, requireText(title, 'title'), checkPriority(priority));
  return store.getBacklogItem(id);
}

/**
 * Lista las tareas de un proyecto, opcionalmente por estado.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId: string, status?: string|null }} input
 */
export function listItems(store, { projectId, status = null }) {
  requireProject(store, projectId);
  return store.listBacklog(projectId, status == null ? null : checkStatus(status));
}

/**
 * Cambia estado y/o prioridad de una tarea y la devuelve actualizada.
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ id: string, status?: string, priority?: number }} input
 */
export function updateItem(store, { id, status, priority }) {
  const fields = {};
  if (status   !== undefined) fields.status   = checkStatus(status);
  if (priority !== undefined) fields.priority = checkPriority(priority);
  if (Object.keys(fields).length === 0) throw new Error(t('backlog.updateNoFields'));

  if (!store.getBacklogItem(id)) throw new Error(t('service.unknownBacklogItem', { id }));
  store.updateBacklogItem(id, fields);
  return store.getBacklogItem(id);
}

function checkStatus(status) {
  if (!BACKLOG_STATUSES.includes(status)) {
    throw new Error(t('service.invalidStatus', { status, valid: BACKLOG_STATUSES.join(' | ') }));
  }
  return status;
}

function checkPriority(priority) {
  const value = Number(priority);
  if (!Number.isInteger(value) || value < MIN_PRIORITY || value > MAX_PRIORITY) {
    throw new Error(t('service.invalidPriority', { priority, min: MIN_PRIORITY, max: MAX_PRIORITY }));
  }
  return value;
}
