import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Daily logs ─────────────────────────────────────────────────────

export function cmdDailyLog(projectId, content) {
  if (!projectId || !content) fail(t('usage', { syntax: 'mempunk daily log <project_id> "<content>"' }));
  requireVault();

  const store = openStore();
  const { filePath, appended } = store.addDailyLog(projectId, content);
  if (appended) {
    console.log(t('daily.appended', { path: filePath }));
  } else {
    console.log(t('daily.created', { path: filePath }));
  }
}

export function cmdDailyList(projectId) {
  if (!projectId) fail(t('usage', { syntax: 'mempunk daily list <project_id>' }));
  requireVault();

  const store = openStore();
  const rows  = store.listDailyLogs(projectId);
  if (opts.json) return printJson(rows);
  printTable(
    ['date', 'file_path'],
    rows.map((r) => [r.date, r.file_path])
  );
}
