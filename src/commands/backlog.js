import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Backlog ────────────────────────────────────────────────────────

export function cmdBacklogAdd(projectId, title) {
  if (!projectId || !title) fail('Uso: mempunk backlog add <project_id> "<title>" [--priority 1|2|3]');
  requireVault();

  const priority = opts.priority !== undefined ? parseInt(opts.priority, 10) : 2;
  const store = openStore();
  const id = store.addBacklogItem(projectId, title, priority);
  console.log(`Tarea agregada con id ${id}`);
}

export function cmdBacklogList(projectId) {
  if (!projectId) fail('Uso: mempunk backlog list <project_id> [--status pending|in_progress|done]');
  requireVault();

  const store = openStore();
  const rows = store.listBacklog(projectId, opts.status ?? null);
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'title', 'status', 'priority', 'updated_at'],
    rows.map((r) => [r.id, r.title, r.status, r.priority, r.updated_at])
  );
}

export function cmdBacklogUpdate(id) {
  if (!id) fail('Uso: mempunk backlog update <id> --status <valor> | --priority <valor>');
  requireVault();

  const fields = {};
  if (opts.status   !== undefined) fields.status   = opts.status;
  if (opts.priority !== undefined) fields.priority = parseInt(opts.priority, 10);

  if (Object.keys(fields).length === 0) {
    fail('Especifica al menos --status o --priority para actualizar');
  }

  const store = openStore();
  store.updateBacklogItem(id, fields);
  console.log(`Tarea ${id} actualizada`);
}
