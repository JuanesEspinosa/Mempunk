import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
import { fail } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';
import { _writeProjectPathsFile } from './project.js';

// ── Handlers — Remove ─────────────────────────────────────────────────────────

export function cmdRemove(projectId) {
  if (!projectId) fail('Uso: mempunk remove <project_id> --yes');
  requireVault();

  if (!opts.yes) {
    fail(`Operación destructiva. Confirma con: mempunk remove ${projectId} --yes`);
  }

  const store = openStore();
  if (!store.listProjects().find(p => p.id === projectId)) {
    fail(`Proyecto no encontrado: ${projectId}`);
  }

  // Recolectar ANTES de borrar las filas: los .md de resources/ del proyecto,
  // y los daily cuya fecha no comparte ningún otro proyecto (el archivo diario
  // es compartido — borrarlo con entradas ajenas sería pérdida de datos)
  const resourceFiles = store.db
    .prepare('SELECT file_path FROM resources WHERE project_id = ?')
    .all(projectId)
    .map((r) => r.file_path);

  const soleOwnerDailyFiles = store.db
    .prepare(
      `SELECT file_path FROM daily_logs d
       WHERE project_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM daily_logs o
           WHERE o.date = d.date AND o.project_id != ?
         )`
    )
    .all(projectId, projectId)
    .map((r) => r.file_path);

  // Transacción: un fallo intermedio no debe dejar el proyecto medio borrado.
  // Incluye checkpoints y snapshots — sin esto, un proyecto recreado con el
  // mismo id "heredaría" los checkpoints del anterior
  store.db.transaction(() => {
    store.db.prepare('DELETE FROM backlog             WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM decisions           WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM project_skills      WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM session_log         WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM resources           WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM daily_logs          WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM search_index        WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM session_checkpoints WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM compact_snapshots   WHERE project_id = ?').run(projectId);
    store.db.prepare('DELETE FROM projects            WHERE id = ?').run(projectId);
  })();

  const projectDir = path.join(VAULT_PATH, 'projects', projectId);
  if (fs.existsSync(projectDir)) fs.rmSync(projectDir, { recursive: true, force: true });

  // Borrado de archivos DESPUÉS de la transacción exitosa: si la transacción
  // fallara, las filas seguirían apuntando a archivos existentes (consistente)
  for (const filePath of [...resourceFiles, ...soleOwnerDailyFiles]) {
    try { fs.rmSync(filePath, { force: true }); } catch (_) {}
  }

  // El proyecto pudo tener un root_path mapeado — regenerar el mapa de rutas
  _writeProjectPathsFile(store);

  console.log(`Proyecto "${projectId}" eliminado`);
}
