import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';
import { addDecision, removeDecision } from '../services/decisions.js';

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

export function cmdDecisionRemove(decisionId) {
  if (!decisionId) fail(t('usage', { syntax: 'mempunk decision remove <decision_id> --yes' }));
  requireVault();

  const store = openStore();
  const decision = store.getDecision(decisionId);
  if (!decision) fail(t('decision.notFound', { id: decisionId }));

  // Destructivo: sin --yes solo se muestra qué se borraría
  if (!opts.yes) {
    fail(t('decision.removeConfirm', { id: decisionId, title: decision.title, path: decision.file_path }));
  }

  const { fileRemoved } = removeDecision(store, decisionId);
  console.log(t('decision.removed', { id: decisionId, title: decision.title }));
  if (!fileRemoved) console.log(t('decision.fileMissing', { path: decision.file_path }));
}
