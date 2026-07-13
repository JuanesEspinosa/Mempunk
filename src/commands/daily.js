import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Daily logs ─────────────────────────────────────────────────────

export function cmdDailyLog(projectId, content) {
  if (!projectId || !content) fail('Uso: mempunk daily log <project_id> "<content>"');
  requireVault();

  const store = openStore();
  const { filePath, appended } = store.addDailyLog(projectId, content);
  if (appended) {
    console.log(`Log agregado a ${filePath}`);
  } else {
    console.log(`Log creado en ${filePath}`);
  }
}

export function cmdDailyList(projectId) {
  if (!projectId) fail('Uso: mempunk daily list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.listDailyLogs(projectId);
  if (opts.json) return printJson(rows);
  printTable(
    ['date', 'file_path'],
    rows.map((r) => [r.date, r.file_path])
  );
}
