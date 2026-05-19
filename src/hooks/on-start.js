#!/usr/bin/env node
// # mempunk-hook

// Evento: inicio de sesión de Claude Code
// Inicializa el archivo de tracking de archivos tocados y persiste el proyecto activo.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const VAULT_PATH    = process.env.MEMPUNK_VAULT ?? path.join(os.homedir(), 'Dev-Brain');
const MEMPUNK_DIR   = path.join(VAULT_PATH, '.mempunk');
const ACTIVE_FILE   = path.join(MEMPUNK_DIR, 'active-project.json');
const TOUCHED_FILE  = path.join(MEMPUNK_DIR, 'session-touched.json');
const LOG_FILE      = path.join(MEMPUNK_DIR, 'hooks.log');

function log(message) {
  try {
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-start] ${message}\n`);
  } catch (_) {}
}

try {
  // Garantizar que el directorio .mempunk existe antes de escribir
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  // Reiniciar el registro de archivos tocados al arrancar cada sesión
  fs.writeFileSync(TOUCHED_FILE, '[]', 'utf8');
  log('session-touched.json inicializado');

  // Persistir el proyecto activo si viene declarado en el entorno
  if (process.env.CLAUDE_PROJECT_ID) {
    fs.writeFileSync(
      ACTIVE_FILE,
      JSON.stringify({ project_id: process.env.CLAUDE_PROJECT_ID }),
      'utf8'
    );
    log(`Proyecto activo registrado: ${process.env.CLAUDE_PROJECT_ID}`);
  }
} catch (err) {
  log(`Error: ${err.message}`);
}

// Los hooks nunca terminan con código distinto de 0
process.exit(0);
