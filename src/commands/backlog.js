import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';
import { addItem, listItems, updateItem } from '../services/backlog.js';

// ── Handlers — Backlog ────────────────────────────────────────────────────────

export function cmdBacklogAdd(projectId, title) {
  if (!projectId || !title) fail(t('usage', { syntax: 'mempunk backlog add <project_id> "<title>" [--priority 1-5]' }));
  requireVault();

  const { id } = addItem(openStore(), { projectId, title, priority: opts.priority });
  console.log(t('backlog.added', { id }));
}

export function cmdBacklogList(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk backlog list <project_id> [--status pending|in_progress|done|blocked|cancelled]' }));
  requireVault();

  const rows = listItems(openStore(), { projectId, status: opts.status });
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'title', 'status', 'priority', 'updated_at'],
    rows.map((r) => [r.id, r.title, r.status, r.priority, r.updated_at])
  );
}

export function cmdBacklogUpdate(id) {
  if (!id) fail(t('usage', { syntax: 'mempunk backlog update <id> --status <value> | --priority <value>' }));
  requireVault();

  updateItem(openStore(), { id, status: opts.status, priority: opts.priority });
  console.log(t('backlog.updated', { id }));
}
