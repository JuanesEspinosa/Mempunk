import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Resources ──────────────────────────────────────────────────────

export function cmdResourceAdd(projectId, title) {
  if (!projectId || !title) {
    fail('Uso: mempunk resource add <project_id> "<title>" [--url <url>] [--content "<texto>"]');
  }
  requireVault();

  const store = openStore();
  const { filePath } = store.addResource(projectId, title, opts.url ?? null, opts.content ?? '');
  console.log(`Resource guardado en ${filePath}`);
}

export function cmdResourceList(projectId) {
  if (!projectId) fail('Uso: mempunk resource list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.listResources(projectId);
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'title', 'url', 'created_at'],
    rows.map((r) => [r.id, r.title, r.url ?? '', r.created_at])
  );
}
