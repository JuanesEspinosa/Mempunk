// ── Servicio de proyectos — resolución y validación ──────────────────────────
//
// Lo usan el CLI y el MCP. Lanza Error con mensaje traducido: el CLI lo
// imprime con fail() y el MCP lo devuelve como isError para que el modelo
// pueda corregir la llamada.

import { t } from '../lib/i18n.js';
import { getMappedProjectId } from '../hooks-lib/common.js';

/**
 * Devuelve el proyecto o lanza si no existe.
 * @param {import('../store/VaultStore.js').default} store
 * @param {string} projectId
 */
export function requireProject(store, projectId) {
  const project = store.listProjects().find((p) => p.id === projectId);
  if (!project) throw new Error(t('context.unknownProject', { id: projectId }));
  return project;
}

/**
 * Resuelve el proyecto de una llamada: project_id explícito → proyecto del cwd
 * (CLAUDE_PROJECT_ID o mapa de rutas por prefijo más largo). Valida que exista.
 * Sin el respaldo del proyecto activo global, a propósito: varias sesiones
 * escriben a la vez y una decisión guardada en el proyecto equivocado es peor
 * que un error que pide el project_id.
 *
 * @param {import('../store/VaultStore.js').default} store
 * @param {{ projectId?: string, cwd?: string, resolveFromCwd?: (cwd: string) => string|null }} options
 * @returns {string}
 */
export function resolveProjectId(store, { projectId, cwd = process.cwd(), resolveFromCwd = getMappedProjectId } = {}) {
  const id = projectId?.trim() || resolveFromCwd(cwd);
  if (!id) throw new Error(t('service.noProject', { cwd }));
  return requireProject(store, id).id;
}

/** Lanza si el texto está vacío; devuelve el texto sin espacios en los extremos */
export function requireText(value, field) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new Error(t('service.emptyField', { field }));
  return text;
}
