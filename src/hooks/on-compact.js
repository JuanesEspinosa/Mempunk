#!/usr/bin/env node
// # mempunk-hook

// Evento: compaction del contexto de Claude Code
// Guarda automáticamente una sesión antes de que se comprima el contexto
// para no perder el estado de trabajo en curso.

import { spawnSync } from 'node:child_process';
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
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-compact] ${message}\n`);
  } catch (_) {}
}

/** Devuelve el project_id activo o null si no se puede determinar */
function getProjectId() {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

/** Devuelve el array de archivos tocados en la sesión, o [] si no existe */
function getTouchedFiles() {
  try {
    return JSON.parse(fs.readFileSync(TOUCHED_FILE, 'utf8'));
  } catch (_) {
    return [];
  }
}

try {
  const projectId = getProjectId();

  if (!projectId) {
    log('Sin proyecto activo — sin acción');
    process.exit(0);
  }

  const files   = getTouchedFiles();
  const summary = 'Guardado automático antes de compaction';

  // Construir los argumentos del CLI evitando interpolación de shell
  const spawnArgs = ['session', 'log', projectId, summary];
  if (files.length > 0) {
    spawnArgs.push('--files', files.join(','));
  }

  const result = spawnSync('mempunk', spawnArgs, {
    encoding: 'utf8',
    env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH },
  });

  if (result.status === 0) {
    log(`Sesión guardada para ${projectId} (${files.length} archivos tocados)`);
  } else {
    // Loggear el error pero no interrumpir la compaction
    const errMsg = result.stderr?.trim() || result.error?.message || 'sin detalle';
    log(`Error al guardar sesión: ${errMsg}`);
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
