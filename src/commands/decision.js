import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';
import { addDecision } from '../services/decisions.js';

// ── Handlers — Decisions ──────────────────────────────────────────────────────

export function cmdDecisionAdd(projectId, title) {
  if (!projectId || !title) fail(t('usage', { syntax: 'mempunk decision add <project_id> "<title>" [--tags "tag1,tag2"]' }));
  requireVault();

  const tags = opts.tags ? opts.tags.split(',') : [];
  const { file_path } = addDecision(openStore(), { projectId, title, tags });
  console.log(t('decision.saved', { path: file_path }));
}

export function cmdDecisionList(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk decision list <project_id>' }));
  requireVault();

  const store = openStore();
  const rows = store.listDecisions(projectId);
  if (opts.json) return printJson(rows);

  printTable(
    ['id', 'title', 'tags', 'created_at', 'file_path'],
    rows.map((r) => [r.id, r.title, r.tags, r.created_at, r.file_path])
  );
}
