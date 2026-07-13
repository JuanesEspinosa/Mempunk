import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Búsqueda ───────────────────────────────────────────────────────

export function cmdSearch(query) {
  if (!query) fail('Uso: mempunk search "<query>" [--project <project_id>]');
  requireVault();

  const store   = openStore();
  const results = store.search(query, opts.project ?? null);
  if (opts.json) return printJson(results);

  if (results.length === 0) {
    console.log('Sin resultados');
    return;
  }

  printTable(
    ['type', 'item_id', 'project_id', 'file_path'],
    results.map((r) => [r.type, r.item_id, r.project_id, r.file_path ?? ''])
  );
}
