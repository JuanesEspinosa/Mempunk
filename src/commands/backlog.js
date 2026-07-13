import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Backlog ────────────────────────────────────────────────────────

export function cmdBacklogAdd(projectId, title) {
  if (!projectId || !title) fail(t('usage', { syntax: 'mempunk backlog add <project_id> "<title>" [--priority 1|2|3]' }));
  requireVault();

  const priority = opts.priority !== undefined ? parseInt(opts.priority, 10) : 2;
  const store = openStore();
  const id = store.addBacklogItem(projectId, title, priority);
  console.log(t('backlog.added', { id }));
}

export function cmdBacklogList(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk backlog list <project_id> [--status pending|in_progress|done]' }));
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
  if (!id) fail(t('usage', { syntax: 'mempunk backlog update <id> --status <value> | --priority <value>' }));
  requireVault();

  const fields = {};
  if (opts.status   !== undefined) fields.status   = opts.status;
  if (opts.priority !== undefined) fields.priority = parseInt(opts.priority, 10);

  if (Object.keys(fields).length === 0) {
    fail(t('backlog.updateNoFields'));
  }

  const store = openStore();
  store.updateBacklogItem(id, fields);
  console.log(t('backlog.updated', { id }));
}
