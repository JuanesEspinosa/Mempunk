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

// HOME temporal: on-start materializa skills/agentes globales en ~/.claude —
// sin esto los tests tocarían la instalación real del desarrollador
const TEMP_HOME    = path.join(os.tmpdir(), `mempunk-hooks-home-${Date.now()}`);

// Los tests corren contra los BUNDLES de dist/hooks — lo que realmente se
// instala en ~/.claude/hooks/. npm test los regenera via pretest (npm run build).
function runHook(hookFile, input, extraEnv = {}) {
  return spawnSync('node', [path.join(PROJECT_ROOT, 'dist', 'hooks', hookFile)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT, MEMPUNK_CLI, HOME: TEMP_HOME, USERPROFILE: TEMP_HOME, ...extraEnv },
  });
}

function runCli(args) {
  return spawnSync('node', [CLI_PATH, ...args.split(' ')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT },
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
        model: extraUsage.model ?? 'claude-test-model',
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
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  runCli('init');
  runCli('project add testproj "Test Project"');
  fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));

  transcriptPath = path.join(MEMPUNK_DIR, 'test.jsonl');
});

afterAll(() => {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  fs.rmSync(TEMP_HOME, { recursive: true, force: true });
});

// ── on-prompt.js ──────────────────────────────────────────────────────────────

describe('on-prompt.js', () => {
  // Plan v3, 0.2: el % de contexto vive solo en la statusline; el hook ya no
  // lee el transcript ni avisa por umbral
  it('no lee el transcript ni avisa aunque el contexto esté casi lleno', () => {
    const warnFile = path.join(MEMPUNK_DIR, 'context-warn-state.json');
    fs.rmSync(warnFile, { force: true });
    fs.writeFileSync(transcriptPath, makeTranscript(1, { input_tokens: 190_000 }));
    const r = runHook('on-prompt.js', { session_id: 'sess-full', transcript_path: transcriptPath });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
    expect(fs.existsSync(warnFile)).toBe(false);
  });

  it('responde {} con stdin vacío o inválido', () => {
    for (const input of ['', 'no-json']) {
      const r = runHook('on-prompt.js', input);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    }
  });
});

// ── on-compact.js ─────────────────────────────────────────────────────────────

describe('on-compact.js (CompactCapture)', () => {
  it('guarda compact_snapshot en SQLite y retorna {}', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(3));
    // El stdin real de PreCompact trae `trigger` en snake_case, no compactType
    const input = {
      session_id: 'sess-compact-001',
      transcript_path: transcriptPath,
      hook_event_name: 'PreCompact',
      trigger: 'auto',
    };
    const r = runHook('on-compact.js', input);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('sess-compact-001');
    db.close();
    expect(row).toBeDefined();
    expect(row.compact_type).toBe('auto');
    expect(row.message_count).toBe(6); // 3 user + 3 assistant
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
    expect(out.hookSpecificOutput.additionalContext).toContain('MEMPUNK CONTEXT — testproj');
    expect(out.hookSpecificOutput.additionalContext).toContain('src/auth.ts');
  });

  it('inyecta state.md, backlog y archivos del snapshot sin pasar de 9500 caracteres', () => {
    const stateFile = path.join(TEMP_VAULT, 'projects', 'testproj', 'wiki', 'state.md');
    const original  = fs.readFileSync(stateFile, 'utf8');
    fs.writeFileSync(stateFile, `# Estado\n\n## Estado actual\n\nRefactor de pagos en curso.\n${'x'.repeat(20_000)}\n`, 'utf8');
    runCli('backlog add testproj Migrar-pagos');
    try {
      const r   = runHook('on-start.js', { session_id: 'sess-state', source: 'compact' });
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('Refactor de pagos en curso');
      expect(ctx.length).toBeLessThanOrEqual(9500);
      // El estado se recorta a su tope y no desplaza al backlog ni al snapshot
      expect(ctx).toContain('Migrar-pagos');
      expect(ctx).toContain('src/auth.ts');
    } finally {
      fs.writeFileSync(stateFile, original, 'utf8');
    }
  });

  it('con state.md normal incluye backlog y archivos del snapshot', () => {
    const r   = runHook('on-start.js', { session_id: 'sess-state2', source: 'compact' });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('Migrar-pagos');
    expect(ctx).toContain('src/auth.ts');
  });

  it('si `mempunk context` falla cae al formato basado solo en el snapshot', () => {
    // CLI falso: falla en `context` y delega el resto al CLI real
    const fakeCli = path.join(TEMP_HOME, 'fake-cli-no-context.mjs');
    fs.writeFileSync(fakeCli, [
      "import { spawnSync } from 'node:child_process';",
      "const args = process.argv.slice(2);",
      "if (args[0] === 'context') { process.stderr.write('boom'); process.exit(1); }",
      `const r = spawnSync(process.execPath, [${JSON.stringify(CLI_PATH)}, ...args], { stdio: 'inherit' });`,
      'process.exit(r.status ?? 1);',
    ].join('\n'));
    const r   = runHook('on-start.js', { session_id: 'sess-fallback', source: 'compact' }, { MEMPUNK_CLI: `node ${fakeCli}` });
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    expect(ctx).toContain('CONTEXTO RESTAURADO');
    expect(ctx).not.toContain('MEMPUNK CONTEXT');
    expect(ctx).toContain('src/auth.ts');
  });

  it('restaura contexto aunque el proyecto no tenga snapshot', () => {
    const activeFile = path.join(MEMPUNK_DIR, 'active-project.json');
    const original   = fs.readFileSync(activeFile, 'utf8');
    runCli('project add nosnap NoSnap');
    try {
      const r   = runHook('on-start.js', { session_id: 'sess-nosnap', source: 'compact' }, { CLAUDE_PROJECT_ID: 'nosnap' });
      const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
      expect(ctx).toContain('MEMPUNK CONTEXT — nosnap');
    } finally {
      // on-start persiste CLAUDE_PROJECT_ID como proyecto activo: no contaminar los demás tests
      fs.writeFileSync(activeFile, original, 'utf8');
    }
  });

  it('retorna {} cuando source=startup sin auto-start', () => {
    const r = runHook('on-start.js', { session_id: 'sess-startup', source: 'startup' });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});
  });

  describe('auto-start determinista', () => {
    const flag    = path.join(MEMPUNK_DIR, 'auto-start.flag');
    const repoDir = path.join(os.tmpdir(), `mempunk-autostart-repo-${Date.now()}`);

    beforeAll(() => {
      fs.mkdirSync(repoDir, { recursive: true });
      runCli('project add autoproj "Auto Project"');
      const activeFile = path.join(MEMPUNK_DIR, 'active-project.json');
      const original   = fs.readFileSync(activeFile, 'utf8');
      spawnSync('node', [CLI_PATH, 'project', 'activate', 'autoproj', '--here'], {
        cwd: repoDir,
        env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT },
        encoding: 'utf8',
      });
      // activate cambia el activo global: no contaminar los demás tests
      fs.writeFileSync(activeFile, original, 'utf8');
      fs.writeFileSync(flag, '');
    });

    afterAll(() => {
      fs.rmSync(flag, { force: true });
      fs.rmSync(repoDir, { recursive: true, force: true });
    });

    const contextOf = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;

    it('inyecta el contexto del proyecto mapeado al cwd, sin invocar al loader', () => {
      const r   = runHook('on-start.js', { session_id: 'sess-auto', source: 'startup', cwd: repoDir });
      const ctx = contextOf(r);
      expect(r.status).toBe(0);
      expect(ctx).toContain('MEMPUNK CONTEXT — autoproj');
      expect(ctx).not.toContain('@mempunk-loader');
      expect(ctx.length).toBeLessThanOrEqual(9500);
    });

    it('con el cwd sin mapear inyecta solo el aviso, aunque haya un proyecto activo global', () => {
      const r   = runHook('on-start.js', {
        session_id: 'sess-auto-unmapped', source: 'startup', cwd: path.join(os.tmpdir(), `sin-mapear-${Date.now()}`),
      });
      const ctx = contextOf(r);
      expect(ctx).toContain('no está vinculado a un proyecto de Mempunk');
      expect(ctx).toContain('/mempunk');
      expect(ctx).not.toContain('MEMPUNK CONTEXT');
      expect(ctx).not.toContain('@mempunk-loader');
    });

    it('vuelve a la instrucción del loader si mempunk context falla', () => {
      const fakeCli = path.join(MEMPUNK_DIR, 'fake-cli-autostart.mjs');
      fs.writeFileSync(fakeCli, [
        "import { spawnSync } from 'node:child_process';",
        'const args = process.argv.slice(2);',
        "if (args[0] === 'context') { process.stderr.write('boom'); process.exit(1); }",
        `const r = spawnSync(process.execPath, [${JSON.stringify(CLI_PATH)}, ...args], { stdio: 'inherit' });`,
        'process.exit(r.status ?? 1);',
      ].join('\n'));
      const r = runHook('on-start.js', { session_id: 'sess-auto-fail', source: 'startup', cwd: repoDir },
        { MEMPUNK_CLI: `node ${fakeCli}` });
      const ctx = contextOf(r);
      expect(ctx).toContain('@mempunk-loader');
      expect(ctx).not.toContain('MEMPUNK CONTEXT');
    });

    it('CLAUDE_PROJECT_ID tiene prioridad sobre el cwd', () => {
      const activeFile = path.join(MEMPUNK_DIR, 'active-project.json');
      const original   = fs.readFileSync(activeFile, 'utf8');
      try {
        const r = runHook('on-start.js', { session_id: 'sess-auto-env', source: 'startup', cwd: repoDir },
          { CLAUDE_PROJECT_ID: 'testproj' });
        expect(contextOf(r)).toContain('MEMPUNK CONTEXT — testproj');
      } finally {
        fs.writeFileSync(activeFile, original, 'utf8');
      }
    });
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

  it('los tool_results (type:user sin texto) no cuentan como turnos', () => {
    // 2 turnos reales + 8 tool_results: sin el filtro serían 10 "turnos" y guardaría
    let t = makeTranscript(2);
    for (let i = 0; i < 8; i++) {
      t += JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: 'ok' }] },
      }) + '\n';
    }
    fs.writeFileSync(transcriptPath, t);
    const r = runHook('on-stop.js', {
      session_id: 'sess-toolresult',
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-toolresult');
    db.close();
    expect(row).toBeUndefined();
  });

  it('detecta archivos con paths de Windows y los normaliza a /', () => {
    let t = makeTranscript(5);
    t += JSON.stringify({
      type: 'user',
      message: { role: 'user', content: 'revisa src\\hooks\\on-stop.js por favor' },
    }) + '\n';
    fs.writeFileSync(transcriptPath, t);
    const r = runHook('on-stop.js', {
      session_id: 'sess-winpath',
      transcript_path: transcriptPath,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-winpath');
    db.close();
    expect(row).toBeDefined();
    expect(JSON.parse(row.files_found)).toContain('src/hooks/on-stop.js');
  });

  it('guarda el checkpoint en el proyecto mapeado al cwd, no en el activo global', () => {
    const repoDir = path.join(os.tmpdir(), `mempunk-cwd-repo-${Date.now()}`);
    fs.mkdirSync(repoDir, { recursive: true });

    runCli('project add cwdproj "Cwd Project"');
    // Mapear repoDir → cwdproj corriendo activate --here desde ese directorio
    spawnSync('node', [CLI_PATH, 'project', 'activate', 'cwdproj', '--here'], {
      cwd: repoDir,
      env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT },
      encoding: 'utf8',
    });
    // El activo global queda apuntando a testproj — el cwd debe ganarle
    fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));

    fs.writeFileSync(transcriptPath, makeTranscript(6));
    const r = runHook('on-stop.js', {
      session_id: 'sess-cwd-map',
      transcript_path: transcriptPath,
      cwd: repoDir,
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-cwd-map');
    db.close();
    expect(row).toBeDefined();
    expect(row.project_id).toBe('cwdproj');

    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('cae al proyecto activo global cuando el cwd no está mapeado', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(6));
    const r = runHook('on-stop.js', {
      session_id: 'sess-cwd-fallback',
      transcript_path: transcriptPath,
      cwd: path.join(os.tmpdir(), `dir-sin-mapear-${Date.now()}`),
      hook_event_name: 'Stop',
    }, { MEMPUNK_CHECKPOINT_INTERVAL: '5' });
    expect(r.status).toBe(0);

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ?').get('sess-cwd-fallback');
    db.close();
    expect(row).toBeDefined();
    expect(row.project_id).toBe('testproj');
  });

  it('mantiene el contador por sesión — sesiones concurrentes no se resetean entre sí', () => {
    fs.writeFileSync(transcriptPath, makeTranscript(6));
    const base = { transcript_path: transcriptPath, hook_event_name: 'Stop' };
    const env  = { MEMPUNK_CHECKPOINT_INTERVAL: '5' };

    runHook('on-stop.js', { ...base, session_id: 'sess-conc-a' }, env);
    runHook('on-stop.js', { ...base, session_id: 'sess-conc-b' }, env);
    runHook('on-stop.js', { ...base, session_id: 'sess-conc-a' }, env);

    // El estado conserva ambas sesiones (antes era un objeto global que se pisaba)
    const state = JSON.parse(fs.readFileSync(path.join(MEMPUNK_DIR, 'checkpoint-state.json'), 'utf8'));
    expect(state['sess-conc-a']).toBe(6);
    expect(state['sess-conc-b']).toBe(6);
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
