import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Resources ──────────────────────────────────────────────────────

export function cmdResourceAdd(projectId, title) {
  if (!projectId || !title) {
    fail(t('usage', { syntax: 'mempunk resource add <project_id> "<title>" [--url <url>] [--content "<text>"]' }));
  }
  requireVault();

  const store = openStore();
  const { filePath } = store.addResource(projectId, title, opts.url ?? null, opts.content ?? '');
  console.log(t('resource.saved', { path: filePath }));
}

export function cmdResourceList(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk resource list <project_id>' }));
  requireVault();

  const store = openStore();
  const rows  = store.listResources(projectId);
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'title', 'url', 'created_at'],
    rows.map((r) => [r.id, r.title, r.url ?? '', r.created_at])
  );
}
