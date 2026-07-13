import path from 'node:path';
import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Decisions ──────────────────────────────────────────────────────

export function cmdDecisionAdd(projectId, title) {
  if (!projectId || !title) fail('Uso: mempunk decision add <project_id> "<title>" [--tags "tag1,tag2"]');
  requireVault();

  const tags = opts.tags ? opts.tags.split(',').map((t) => t.trim()) : [];
  const id   = `${projectId}-decision-${Date.now()}`;
  const now  = new Date().toISOString();
  const filePath = path.join(VAULT_PATH, 'projects', projectId, 'decisions', `${id}.md`);

  // Plantilla markdown del ADR con frontmatter y secciones estándar
  const content = [
    '---',
    `title: ${title}`,
    `tags: [${tags.join(', ')}]`,
    `created_at: ${now}`,
    '---',
    '',
    `# ${title}`,
    '',
    '## Contexto',
    '',
    '## Decisión',
    '',
    '## Consecuencias',
    '',
  ].join('\n');

  const store = openStore();
  store.addDecision(projectId, title, filePath, tags, content);
  console.log(`Decisión guardada en ${filePath}`);
}

export function cmdDecisionList(projectId) {
  if (!projectId) fail('Uso: mempunk decision list <project_id>');
  requireVault();

  const store = openStore();
  const rows = store.listDecisions(projectId);
  if (opts.json) return printJson(rows);

  printTable(
    ['id', 'title', 'tags', 'created_at', 'file_path'],
    rows.map((r) => [r.id, r.title, r.tags, r.created_at, r.file_path])
  );
}
