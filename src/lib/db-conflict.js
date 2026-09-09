import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { runGit, gitEnv } from './git.js';

// ── Resolución del conflicto binario en mempunk.db ───────────────────────────
//
// Regla v1 (plan §3.5): gana la BD con la actividad más reciente; la perdedora
// se conserva en .mempunk/backups/conflict-<stamp>-<ours|theirs>.db.
// Una copia que no sea una SQLite válida pierde siempre frente a la válida.

// Tabla y columna que marcan "última actividad" en cada BD
const ACTIVITY_COLUMNS = [
  ['session_log', 'started_at'],
  ['daily_logs',  'created_at'],
  ['decisions',   'created_at'],
  ['backlog',     'updated_at'],
];

/**
 * Timestamp ISO de la actividad más reciente registrada en la BD.
 * Tablas o columnas ausentes se ignoran; sin actividad devuelve ''.
 * @param {import('better-sqlite3').Database} db
 * @returns {string}
 */
export function latestActivity(db) {
  let latest = '';
  for (const [table, column] of ACTIVITY_COLUMNS) {
    let value = null;
    try {
      value = db.prepare(`SELECT MAX(${column}) AS at FROM ${table}`).get()?.at;
    } catch (_) {
      // Tabla o columna inexistente en esta versión del vault — no cuenta
    }
    if (value && value > latest) latest = value;
  }
  return latest;
}

/**
 * Extrae un stage del índice (:2: ours, :3: theirs) escribiendo el blob
 * directamente en `file` (sin pasar por memoria — la BD puede ser grande).
 */
function extractStage(dir, relPath, stage, file) {
  const fd = fs.openSync(file, 'wx', 0o600);
  let r;
  try {
    r = spawnSync('git', ['show', `:${stage}:${relPath}`], {
      cwd: dir, stdio: ['ignore', fd, 'pipe'], encoding: 'utf8', env: gitEnv(),
    });
  } finally {
    fs.closeSync(fd);
  }
  if (r.status !== 0) {
    throw new Error(`git show :${stage}:${relPath} failed: ${(r.stderr || r.error?.message || '').trim()}`);
  }
}

/**
 * Actividad de una copia. Si no abre o no pasa integrity_check cuenta como
 * '' y se marca inválida, de modo que la copia válida gane.
 * @returns {{ at: string, valid: boolean }}
 */
function inspectSide(dbPath) {
  let db;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const ok = db.pragma('integrity_check')?.[0]?.integrity_check === 'ok';
    return ok ? { at: latestActivity(db), valid: true } : { at: '', valid: false };
  } catch (_) {
    return { at: '', valid: false };
  } finally {
    db?.close();
  }
}

/** Una sola copia válida gana; si no, la de actividad más reciente; empate → ours */
function pickWinner(ours, theirs) {
  if (ours.valid !== theirs.valid) return ours.valid ? 'ours' : 'theirs';
  return theirs.at > ours.at ? 'theirs' : 'ours';
}

/** conflict-<stamp con ms>-<loser>.db; si ya existe, agrega un contador */
function loserBackupPath(backupsDir, loser) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base  = path.join(backupsDir, `conflict-${stamp}-${loser}`);
  let candidate = `${base}.db`;
  for (let n = 2; fs.existsSync(candidate); n += 1) candidate = `${base}-${n}.db`;
  return candidate;
}

/**
 * Resuelve el conflicto de merge en `relPath` (mempunk.db) dentro de `dir`.
 * Deja la ganadora en el árbol de trabajo y staged; la perdedora en backups.
 * @param {string} dir     - Raíz del vault (repo git)
 * @param {string} relPath - Ruta relativa de la BD, con "/"
 * @returns {{ winner: 'ours'|'theirs', oursAt: string, theirsAt: string, loserBackup: string, invalid: 'ours'|'theirs'|null }}
 */
export function resolveDbConflict(dir, relPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mempunk-conflict-'));
  try {
    const oursTmp   = path.join(tmpDir, 'ours.db');
    const theirsTmp = path.join(tmpDir, 'theirs.db');
    extractStage(dir, relPath, 2, oursTmp);
    extractStage(dir, relPath, 3, theirsTmp);

    const ours   = inspectSide(oursTmp);
    const theirs = inspectSide(theirsTmp);
    const winner = pickWinner(ours, theirs);
    const loser  = winner === 'ours' ? 'theirs' : 'ours';

    const backupsDir = path.join(dir, '.mempunk', 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const loserBackup = loserBackupPath(backupsDir, loser);

    fs.copyFileSync(winner === 'ours' ? oursTmp : theirsTmp, path.join(dir, relPath));
    fs.copyFileSync(winner === 'ours' ? theirsTmp : oursTmp, loserBackup);

    const add = runGit(['add', '--', relPath], { cwd: dir });
    if (add.status !== 0) throw new Error(`git add ${relPath} failed: ${add.stderr}`);

    const invalid = !ours.valid ? 'ours' : (!theirs.valid ? 'theirs' : null);
    return { winner, oursAt: ours.at, theirsAt: theirs.at, loserBackup, invalid };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
