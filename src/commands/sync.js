import fs from 'node:fs';
import path from 'node:path';
import { opts } from '../lib/args.js';
import { printTable } from '../lib/output.js';
import { VAULT_PATH, requireVault, openStore } from '../lib/vault.js';

// ── Handlers — Sync ───────────────────────────────────────────────────────────

// Archivos de scaffold que deben existir en cada proyecto
const SCAFFOLD_FILES = ['INDEX.md', 'wiki/state.md', 'wiki/log.md', 'wiki/index.md'];

export function cmdSync() {
  requireVault();

  const store = openStore();
  let { missing_files, unregistered_files } = store.sync();

  // Filtrar por proyecto si se especificó --project
  if (opts.project) {
    const pid = opts.project;
    missing_files = missing_files.filter((f) => f.project_id === pid);
    // Los huérfanos de resources/ llevan el proyecto en el nombre del archivo
    // (<pid>-resource-*.md) y los de daily/ son compartidos entre proyectos:
    // ocultarlos haría pasar por limpio un vault con huérfanos reales
    unregistered_files = unregistered_files.filter((f) =>
      f.file_path.includes(path.join('projects', pid) + path.sep) ||
      f.file_path.includes(path.join('projects', pid) + '/') ||
      (f.type === 'resource' && path.basename(f.file_path).startsWith(`${pid}-resource-`)) ||
      f.type === 'daily'
    );
  }

  // Verificar archivos de scaffold para cada proyecto registrado
  const projects = opts.project
    ? store.listProjects().filter((p) => p.id === opts.project)
    : store.listProjects();

  const missingScaffold = [];
  for (const proj of projects) {
    for (const file of SCAFFOLD_FILES) {
      const fullPath = path.join(VAULT_PATH, 'projects', proj.id, file);
      if (!fs.existsSync(fullPath)) {
        missingScaffold.push({ project_id: proj.id, file });
      }
    }
  }

  if (missing_files.length === 0 && unregistered_files.length === 0 && missingScaffold.length === 0) {
    console.log('Vault sincronizado correctamente');
    return;
  }

  if (missing_files.length > 0) {
    console.log('\nRegistros sin archivo en disco:');
    printTable(
      ['type', 'id', 'project_id', 'file_path'],
      missing_files.map((f) => [f.type, f.id, f.project_id, f.file_path])
    );
  }

  if (unregistered_files.length > 0) {
    console.log('\nArchivos sin registro en BD:');
    printTable(
      ['type', 'file_path'],
      unregistered_files.map((f) => [f.type, f.file_path])
    );
  }

  if (missingScaffold.length > 0) {
    console.log('\nArchivos de scaffold faltantes:');
    printTable(
      ['project_id', 'archivo'],
      missingScaffold.map((f) => [f.project_id, f.file])
    );
  }
}
