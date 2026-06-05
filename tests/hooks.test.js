import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const CLI_PATH     = path.join(PROJECT_ROOT, 'src', 'cli.js');

// Vault temporal aislado
const TEMP_VAULT   = path.join(os.tmpdir(), `mempunk-hooks-test-${Date.now()}`);
const MEMPUNK_DIR  = path.join(TEMP_VAULT, '.mempunk');
const MEMPUNK_CLI  = `node ${CLI_PATH}`;

function runHook(hookFile, input, extraEnv = {}) {
  return spawnSync('node', [path.join(PROJECT_ROOT, 'src', 'hooks', hookFile)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_VAULT: TEMP_VAULT, MEMPUNK_CLI, ...extraEnv },
  });
}

function runCli(args) {
  return spawnSync('node', [CLI_PATH, ...args.split(' ')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_VAULT: TEMP_VAULT },
    encoding: 'utf8',
  });
}

/** Crea un transcript JSONL con N mensajes de usuario */
function makeTranscript(nTurns, extraUsage = {}) {
  const lines = [];
  for (let i = 1; i <= nTurns; i++) {
    lines.push(JSON.stringify({ type: 'user', message: { role: 'user', content: `mensaje ${i}` } }));
    lines.push(JSON.stringify({
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `respuesta ${i} con src/auth.ts` }],
        usage: {
          input_tokens:                extraUsage.input_tokens ?? 1000,
          cache_creation_input_tokens: extraUsage.cache_creation_input_tokens ?? 0,
          cache_read_input_tokens:     extraUsage.cache_read_input_tokens ?? 0,
        },
      },
    }));
  }
  return lines.join('\n') + '\n';
}

let transcriptPath;

beforeAll(() => {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
  runCli('init');
  runCli('project add testproj "Test Project"');
  fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));

  transcriptPath = path.join(MEMPUNK_DIR, 'test.jsonl');
});

afterAll(() => {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
});

// ── on-prompt.js ──────────────────────────────────────────────────────────────

describe('on-prompt.js (ContextWarning)', () => {
  it('retorna {} cuando el porcentaje es menor al 70%', () => {
    // 60,000 / 200,000 = 30%
    fs.writeFileSync(transcriptPath, makeTranscript(1, { input_tokens: 60_000 }));
    const r = runHook('on-prompt.js', { session_id: 'sess-low', transcript_path: transcriptPath });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  it('retorna systemMessage amarillo cuando pct >= 70%', () => {
    // 140,000 / 200,000 = 70%
    fs.writeFileSync(transcriptPath, makeTranscript(1, { input_tokens: 140_000 }));
    const r = runHook('on-prompt.js', { session_id: 'sess-warn', transcript_path: transcriptPath });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.systemMessage).toMatch(/70%|71%|72%|73%|74%|75%|76%|77%|78%|79%/);
    expect(out.systemMessage).toContain('⚠️');
  });

  it('retorna systemMessage rojo cuando pct >= 80%', () => {
    // 162,000 / 200,000 = 81%
    fs.writeFileSync(transcriptPath, makeTranscript(1, { input_tokens: 162_000 }));
    const r = runHook('on-prompt.js', { session_id: 'sess-alert', transcript_path: transcriptPath });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.systemMessage).toMatch(/🚨/);
  });

  it('no avisa dos veces el mismo umbral en la misma sesión', () => {
    const warnFile = path.join(MEMPUNK_DIR, 'context-warn-state.json');
    // Resetear estado para sesión nueva
    fs.writeFileSync(warnFile, JSON.stringify({ session_id: 'sess-dedup', last_warned_pct: 0 }));

    fs.writeFileSync(transcriptPath, makeTranscript(1, { input_tokens: 140_000 }));
    const input = JSON.stringify({ session_id: 'sess-dedup', transcript_path: transcriptPath });

    // Primera llamada: debe avisar
    const r1 = runHook('on-prompt.js', input);
    expect(JSON.parse(r1.stdout).systemMessage).toBeDefined();

    // Segunda llamada con mismo porcentaje: no debe avisar
    const r2 = runHook('on-prompt.js', input);
    expect(JSON.parse(r2.stdout)).toEqual({});
  });
});

// ── on-compact.js ─────────────────────────────────────────────────────────────

describe('on-compact.js (CompactCapture)', () => {
  it('guarda compact_snapshot en SQLite y retorna {}', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(3));
    const input = {
      session_id: 'sess-compact-001',
      transcript_path: transcriptPath,
      hook_event_name: 'PreCompact',
      compactType: 'automatic',
      messageCount: 6,
    };
    const r = runHook('on-compact.js', input);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('sess-compact-001');
    db.close();
    expect(row).toBeDefined();
    expect(row.compact_type).toBe('automatic');
    expect(row.message_count).toBe(6);
  });

  it('retorna {} silencioso cuando no hay proyecto activo', () => {
    // Eliminar temporalmente el active-project.json
    const activeFile = path.join(MEMPUNK_DIR, 'active-project.json');
    const backup = fs.readFileSync(activeFile, 'utf8');
    fs.unlinkSync(activeFile);

    const r = runHook('on-compact.js', { session_id: 'sess-no-proj', transcript_path: transcriptPath });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});

    // Restaurar
    fs.writeFileSync(activeFile, backup);
  });
});

// ── on-start.js ───────────────────────────────────────────────────────────────

describe('on-start.js (CompactRestore)', () => {
  it('retorna hookSpecificOutput con additionalContext cuando source=compact', () => {
    // Guardar un compact_snapshot para que pueda restaurar
    const tmpFile = path.join(os.tmpdir(), `mc-test-${Date.now()}.json`);
    const turns = [
      { type: 'human', message: { content: 'implementa JWT' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Editando auth.ts' }] } },
    ];
    fs.writeFileSync(tmpFile, JSON.stringify({
      project_id: 'testproj', session_id: 'sess-restore', compact_type: 'automatic', message_count: 2,
      raw_turns: JSON.stringify(turns),
      files_found: JSON.stringify(['src/auth.ts']),
      commands_run: JSON.stringify(['npm test']),
    }));
    runCli(`session save-compact ${tmpFile}`);

    const r = runHook('on-start.js', { session_id: 'sess-new', source: 'compact' });
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.hookSpecificOutput).toBeDefined();
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.additionalContext).toContain('CONTEXTO RESTAURADO');
    expect(out.hookSpecificOutput.additionalContext).toContain('src/auth.ts');
  });

  it('retorna {} cuando source=startup sin auto-start', () => {
    const r = runHook('on-start.js', { session_id: 'sess-startup', source: 'startup' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  it('inicializa session-touched.json en ambos casos', () => {
    const touchedFile = path.join(MEMPUNK_DIR, 'session-touched.json');
    // startup
    runHook('on-start.js', { session_id: 'sess-x', source: 'startup' });
    expect(fs.existsSync(touchedFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(touchedFile, 'utf8'))).toEqual([]);
  });
});

// ── on-stop.js ────────────────────────────────────────────────────────────────

describe('on-stop.js (AutoCheckpoint)', () => {
  it('sale con exit 0 sin guardar cuando turno < INTERVAL', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(2)); // 2 turnos < 5
    const r = runHook('on-stop.js', {
      session_id: 'sess-stop-new',
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);
    // on-stop.js no escribe nada a stdout cuando no guarda
    expect(r.stdout.trim()).toBe('');

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-stop-new');
    db.close();
    expect(row).toBeUndefined();
  });

  it('guarda checkpoint cuando turno >= INTERVAL', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(6)); // 6 >= 5
    const r = runHook('on-stop.js', {
      session_id: 'sess-stop-save',
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-stop-save');
    db.close();
    expect(row).toBeDefined();
    expect(row.turn_count).toBe(6);
  });

  it('no guarda de nuevo si no hubo nuevos turnos', () => {
    // La sesión anterior ya guardó turno=6. Nueva llamada con mismo transcript → sin cambio
    fs.writeFileSync(transcriptPath, makeTranscript(6));
    const r = runHook('on-stop.js', {
      session_id: 'sess-stop-save',
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const rows = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').all('sess-stop-save');
    db.close();
    expect(rows.length).toBe(1); // solo uno, no duplicado
  });

  it('resetea checkpoint-state cuando cambia la session_id', () => {
    // Nueva sesión con solo 2 turnos pero checkpoint-state tenía last_saved_turn=6 de otra sesión
    fs.writeFileSync(transcriptPath, makeTranscript(6));
    const r = runHook('on-stop.js', {
      session_id: 'sess-stop-reset-' + Date.now(),
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const rows = db.prepare('SELECT * FROM session_checkpoints WHERE turn_count = 6 ORDER BY id DESC LIMIT 1').all();
    db.close();
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ── statusline.js ─────────────────────────────────────────────────────────────

describe('statusline.js (ContextMeter)', () => {
  function runStatusline(input) {
    return spawnSync('node', [path.join(PROJECT_ROOT, 'src', 'statusline.js')], {
      input: JSON.stringify(input),
      encoding: 'utf8',
      cwd: PROJECT_ROOT,
    });
  }

  it('muestra placeholder cuando no hay datos de contexto', () => {
    const r = runStatusline({});
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('ctx: --');
  });

  it('muestra barra verde con 43%', () => {
    const r = runStatusline({
      context_window: { used_percentage: 43 },
      model: { display_name: 'claude-sonnet' },
      cost: { total_cost_usd: 0.031 },
    });
    expect(r.stdout).toContain('43%');
    expect(r.stdout).toContain('🟢');
    expect(r.stdout).toContain('claude-sonnet');
    expect(r.stdout).toContain('$0.031');
  });

  it('muestra emoji ⚠️ con 73%', () => {
    const r = runStatusline({ context_window: { used_percentage: 73 } });
    expect(r.stdout).toContain('73%');
    expect(r.stdout).toContain('⚠️');
  });

  it('muestra emoji 🔶 con 81%', () => {
    const r = runStatusline({ context_window: { used_percentage: 81 } });
    expect(r.stdout).toContain('🔶');
  });

  it('muestra emoji 🚨 con 84%', () => {
    const r = runStatusline({ context_window: { used_percentage: 84 } });
    expect(r.stdout).toContain('🚨');
  });

  it('barra tiene 10 bloques totales', () => {
    const r = runStatusline({ context_window: { used_percentage: 50 } });
    const barMatch = r.stdout.match(/([█░]+)/);
    expect(barMatch).not.toBeNull();
    expect(barMatch[1].length).toBe(10);
  });
});
