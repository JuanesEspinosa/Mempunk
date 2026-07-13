import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
import { fail, printTable, printJson } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Skills ─────────────────────────────────────────────────────────

export function cmdSkillAdd(projectId, name) {
  if (!projectId || !name) fail('Uso: mempunk skill add <project_id> <name>');
  requireVault();

  const now      = new Date().toISOString();
  const filePath = path.join(VAULT_PATH, 'projects', projectId, 'skills', `${name}.md`);

  // Plantilla inicial del skill con frontmatter y sección vacía
  const content = [
    '---',
    `project_id: ${projectId}`,
    `name: ${name}`,
    `updated_at: ${now}`,
    '---',
    '',
    '## Contexto',
    '',
  ].join('\n');

  const store = openStore();
  store.addSkill(projectId, name, filePath, content);
  console.log(`Skill ${name} creado en ${filePath}`);
}

export function cmdSkillList(projectId) {
  if (!projectId) fail('Uso: mempunk skill list <project_id>');
  requireVault();

  const store = openStore();
  const rows  = store.getSkills(projectId);
  if (opts.json) return printJson(rows);
  printTable(
    ['id', 'name', 'file_path', 'updated_at'],
    rows.map((r) => [r.id, r.name, r.file_path, r.updated_at])
  );
}

export function cmdSkillUpdate(id) {
  if (!id || !opts.file) fail('Uso: mempunk skill update <id> --file <path_al_markdown>');
  requireVault();

  // Resolver ruta relativa o absoluta del archivo fuente
  const sourcePath = path.resolve(opts.file);
  if (!fs.existsSync(sourcePath)) fail(`Archivo no encontrado: ${sourcePath}`);

  const content = fs.readFileSync(sourcePath, 'utf8');
  const store   = openStore();
  store.updateSkill(id, content);
  console.log(`Skill ${id} actualizado`);
}
