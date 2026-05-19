#!/usr/bin/env node
// # mempunk-hook

// Evento: cierre de sesión de Claude Code
// Guarda la sesión final con los archivos tocados y limpia el estado temporal.

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
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [on-stop] ${message}\n`);
  } catch (_) {}
}

function getProjectId() {
  if (process.env.CLAUDE_PROJECT_ID) return process.env.CLAUDE_PROJECT_ID;
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, 'utf8'));
    return data.project_id ?? null;
  } catch (_) {
    return null;
  }
}

try {
  const projectId = getProjectId();

  // Solo actuar si hay proyecto activo y existe el archivo de tracking
  if (!projectId || !fs.existsSync(TOUCHED_FILE)) {
    log('Sin proyecto activo o sin session-touched.json — sin acción');
    process.exit(0);
  }

  let files = [];
  try {
    files = JSON.parse(fs.readFileSync(TOUCHED_FILE, 'utf8'));
  } catch (_) {}

  if (files.length > 0) {
    const summary    = 'Guardado automático al cerrar sesión';
    const spawnArgs  = ['session', 'log', projectId, summary, '--files', files.join(',')];

    const result = spawnSync('mempunk', spawnArgs, {
      encoding: 'utf8',
      env: { ...process.env, MEMPUNK_VAULT: VAULT_PATH },
    });

    if (result.status === 0) {
      log(`Sesión guardada para ${projectId} (${files.length} archivos tocados)`);
    } else {
      const errMsg = result.stderr?.trim() || result.error?.message || 'sin detalle';
      log(`Error al guardar sesión: ${errMsg}`);
    }
  } else {
    log(`Sin archivos tocados — sesión no registrada para ${projectId}`);
  }

  // Limpiar el registro temporal independientemente del resultado anterior
  try {
    fs.unlinkSync(TOUCHED_FILE);
    log('session-touched.json eliminado');
  } catch (_) {}
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
