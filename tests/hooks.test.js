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
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT, MEMPUNK_CLI, HOME: TEMP_HOME, USERPROFILE: TEMP_HOME, CLAUDE_CONFIG_DIR: '', ...extraEnv },
  });
}

function runCli(args) {
  return spawnSync('node', [CLI_PATH, ...args.split(' ')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });
  fs.mkdirSync(TEMP_HOME, { recursive: true });
  runCli('init');
  runCli('project add testproj "Test Project"');
  fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));
});

afterAll(() => {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
  fs.rmSync(TEMP_HOME, { recursive: true, force: true });
});

// ── Estado por sesión (Fase 3) ────────────────────────────────────────────────

const SESSIONS_DIR = path.join(MEMPUNK_DIR, 'sessions');
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'hooks');

/** Payload documentado del evento (tests/fixtures/hooks) con los campos de `overrides`. */
function fixture(name, overrides = {}) {
  return { ...JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, `${name}.json`), 'utf8')), ...overrides };
}

function readState(sessionId) {
  return JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, `${sessionId}.json`), 'utf8'));
}

function lastLogLines(n = 5) {
  try {
    return fs.readFileSync(path.join(MEMPUNK_DIR, 'hooks.log'), 'utf8').trim().split('\n').slice(-n).join('\n');
  } catch (_) {
    return '';
  }
}

/** Simula `turns` turnos completos (UserPromptSubmit + Stop) de una sesión. */
function playTurns(sessionId, turns, env = {}, extra = {}) {
  for (let i = 1; i <= turns; i++) {
    runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: sessionId, prompt: `mensaje ${i}`, ...extra }), env);
    runHook('on-stop.js', fixture('stop', { session_id: sessionId, last_assistant_message: `respuesta ${i}`, ...extra }), env);
  }
}

function checkpointRows(sessionId) {
  const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
  const rows = db.prepare('SELECT * FROM session_checkpoints WHERE session_id = ? ORDER BY id').all(sessionId);
  db.close();
  return rows;
}

describe('hooks sin transcript (criterio de salida de la Fase 3)', () => {
  it('ningún hook importa readline ni usa transcript_path', () => {
    const hooksDir = path.join(PROJECT_ROOT, 'src', 'hooks');
    for (const file of fs.readdirSync(hooksDir)) {
      const source = fs.readFileSync(path.join(hooksDir, file), 'utf8');
      expect({ file, readline: source.includes('readline') }).toEqual({ file, readline: false });
      expect({ file, transcript: source.includes('transcript_path') }).toEqual({ file, transcript: false });
    }
  });
});

// ── on-prompt.js ──────────────────────────────────────────────────────────────

describe('on-prompt.js', () => {
  it('cuenta el turno y guarda el prompt en el estado de la sesión', () => {
    const r1 = runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-prompt' }));
    const r2 = runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-prompt', prompt: 'segundo' }));
    expect(r1.status).toBe(0);
    expect(JSON.parse(r2.stdout)).toEqual({});

    const state = readState('sess-prompt');
    expect(state.turns).toBe(2);
    expect(state.first_prompt).toBe('implementa el login con JWT');
    expect(state.project_id).toBe('testproj');
    expect(state.recent_messages.map((m) => m.text)).toEqual(['implementa el login con JWT', 'segundo']);
  });

  it('trunca el prompt a 2000 caracteres y guarda solo los últimos 10 mensajes', () => {
    runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-prompt-long', prompt: 'x'.repeat(5000) }));
    expect(readState('sess-prompt-long').recent_messages[0].text).toHaveLength(2000);

    for (let i = 0; i < 12; i++) {
      runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-prompt-many', prompt: `p${i}` }));
    }
    const state = readState('sess-prompt-many');
    expect(state.turns).toBe(12);
    expect(state.recent_messages).toHaveLength(10);
    expect(state.recent_messages.at(-1).text).toBe('p11');
    expect(state.first_prompt).toBe('p0');
  });

  it('responde {} con stdin vacío o inválido y registra el contrato roto', () => {
    for (const input of ['', 'no-json']) {
      const r = runHook('on-prompt.js', input);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
    }
    expect(lastLogLines()).toMatch(/\[on-prompt\] Contrato: faltan campos session_id, prompt/);
  });

  it('ignora un session_id con caracteres de ruta', () => {
    const r = runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: '../escape' }));
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(MEMPUNK_DIR, 'escape.json'))).toBe(false);
    expect(lastLogLines()).toMatch(/session_id inválido/);
  });
});

// ── Guardia de doble ejecución (plugin activo, D5) ───────────────────────────

describe('hooks manuales con el plugin mempunk@mempunk activo', () => {
  const base = path.join(os.tmpdir(), `mempunk-guard-${Date.now()}`);
  const configDir = path.join(base, 'claude-config');
  const repo = path.join(base, 'repo');

  function writeSettings(file, enabled) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ enabledPlugins: { 'mempunk@mempunk': enabled } }));
  }

  /** on-tool desde `repo` (Claude Code lanza el hook con el cwd del proyecto). */
  function runToolHook(sessionId, extraEnv = {}) {
    return spawnSync('node', [path.join(PROJECT_ROOT, 'dist', 'hooks', 'on-tool.js')], {
      input: JSON.stringify(fixture('post-tool-use-bash', { session_id: sessionId })),
      encoding: 'utf8',
      cwd: repo,
      env: {
        ...process.env, MEMPUNK_LANG: 'es', MEMPUNK_VAULT: TEMP_VAULT, MEMPUNK_CLI,
        HOME: TEMP_HOME, USERPROFILE: TEMP_HOME, CLAUDE_CONFIG_DIR: configDir, MEMPUNK_VIA_PLUGIN: '',
        ...extraEnv,
      },
    });
  }

  const stateExists = (sessionId) => fs.existsSync(path.join(SESSIONS_DIR, `${sessionId}.json`));

  beforeAll(() => fs.mkdirSync(repo, { recursive: true }));
  afterAll(() => fs.rmSync(base, { recursive: true, force: true }));

  it('activo en CLAUDE_CONFIG_DIR: el hook manual sale sin hacer nada y lo registra', () => {
    writeSettings(path.join(configDir, 'settings.json'), true);
    const r = runToolHook('guard-skip');
    expect(r.status).toBe(0);
    expect(stateExists('guard-skip')).toBe(false);
    expect(lastLogLines()).toMatch(/\[on-tool\] plugin mempunk@mempunk activo: hook manual omitido/);
  });

  it('lee un settings.json con BOM (PowerShell y editores de Windows lo añaden)', () => {
    const file = path.join(configDir, 'settings.json');
    writeSettings(file, true);
    fs.writeFileSync(file, `\uFEFF${fs.readFileSync(file, 'utf8')}`);
    runToolHook('guard-bom');
    expect(stateExists('guard-bom')).toBe(false);
  });

  it('el mismo hook lanzado por el plugin sí corre', () => {
    writeSettings(path.join(configDir, 'settings.json'), true);
    runToolHook('guard-plugin', { MEMPUNK_VIA_PLUGIN: '1' });
    expect(stateExists('guard-plugin')).toBe(true);
  });

  it('desactivado en settings.local.json del proyecto: gana el proyecto y el hook corre', () => {
    writeSettings(path.join(configDir, 'settings.json'), true);
    writeSettings(path.join(repo, '.claude', 'settings.local.json'), false);
    runToolHook('guard-project-off');
    expect(stateExists('guard-project-off')).toBe(true);
    fs.rmSync(path.join(repo, '.claude'), { recursive: true, force: true });
  });

  it('sin CLAUDE_CONFIG_DIR lee ~/.claude/settings.json', () => {
    writeSettings(path.join(configDir, 'settings.json'), false);
    writeSettings(path.join(TEMP_HOME, '.claude', 'settings.json'), true);
    runToolHook('guard-home', { CLAUDE_CONFIG_DIR: '' });
    expect(stateExists('guard-home')).toBe(false);
    fs.rmSync(path.join(TEMP_HOME, '.claude', 'settings.json'));
  });

  it('plugin desactivado: el hook manual corre como siempre', () => {
    writeSettings(path.join(configDir, 'settings.json'), false);
    runToolHook('guard-off');
    expect(stateExists('guard-off')).toBe(true);
  });
});

// ── on-tool.js ────────────────────────────────────────────────────────────────

describe('on-tool.js (PostToolUse)', () => {
  it('registra el archivo de Edit relativo al cwd y el comando de Bash', () => {
    const repo = path.join(os.tmpdir(), `mempunk-tool-repo-${Date.now()}`);
    const r1 = runHook('on-tool.js', fixture('post-tool-use-edit', {
      session_id: 'sess-tool', cwd: repo,
      tool_input: { file_path: path.join(repo, 'src', 'auth.ts'), old_string: 'a', new_string: 'b' },
    }));
    const r2 = runHook('on-tool.js', fixture('post-tool-use-bash', { session_id: 'sess-tool' }));
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(r1.stdout).toBe('');

    const state = readState('sess-tool');
    expect(state.files_touched).toEqual(['src/auth.ts']);
    expect(state.commands_run).toEqual(['npm test']);
  });

  it('Write, MultiEdit y NotebookEdit también cuentan; fuera del cwd la ruta queda absoluta con /', () => {
    const outside = path.join(os.tmpdir(), 'otro', 'nota.md');
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-tool-kinds', tool_name: 'Write', tool_input: { file_path: outside } }));
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-tool-kinds', tool_name: 'MultiEdit', tool_input: { file_path: '/repo/a.js', edits: [] } }));
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-tool-kinds', tool_name: 'NotebookEdit', tool_input: { notebook_path: '/repo/n.ipynb' } }));

    const files = readState('sess-tool-kinds').files_touched;
    expect(files).toEqual([outside.replace(/\\/g, '/'), 'a.js', 'n.ipynb']);
  });

  it('no duplica archivos y respeta el tope de 200', () => {
    for (let i = 0; i < 3; i++) {
      runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-tool-dup' }));
    }
    expect(readState('sess-tool-dup').files_touched).toEqual(['src/auth.ts']);
  });

  it('trunca los comandos a 200 caracteres', () => {
    runHook('on-tool.js', fixture('post-tool-use-bash', { session_id: 'sess-tool-cmd', tool_input: { command: 'echo ' + 'y'.repeat(500) } }));
    expect(readState('sess-tool-cmd').commands_run[0]).toHaveLength(200);
  });

  it('registra en hooks.log una herramienta de archivo sin file_path ni notebook_path', () => {
    const r = runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-tool-nopath', tool_input: { path: '/x' } }));
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(SESSIONS_DIR, 'sess-tool-nopath.json'))).toBe(false);
    expect(lastLogLines()).toMatch(/\[on-tool\] Contrato: Edit sin file_path ni notebook_path/);
  });

  it('ignora herramientas que no registra', () => {
    runHook('on-tool.js', fixture('post-tool-use-bash', { session_id: 'sess-tool-other', tool_name: 'Read', tool_input: { file_path: '/repo/x.js' } }));
    expect(fs.existsSync(path.join(SESSIONS_DIR, 'sess-tool-other.json'))).toBe(false);
  });
});

// ── on-compact.js ─────────────────────────────────────────────────────────────

describe('on-compact.js (CompactCapture)', () => {
  it('guarda compact_snapshot desde el estado de la sesión y retorna {}', () => {
    playTurns('sess-compact-001', 3, { MEMPUNK_CHECKPOINT_INTERVAL: '100' });
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-compact-001' }));
    runHook('on-tool.js', fixture('post-tool-use-bash', { session_id: 'sess-compact-001' }));

    const r = runHook('on-compact.js', fixture('pre-compact', { session_id: 'sess-compact-001' }));
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({});

    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('sess-compact-001');
    db.close();
    expect(row).toBeDefined();
    expect(row.compact_type).toBe('auto');
    expect(row.message_count).toBe(6); // 3 user + 3 assistant
    expect(JSON.parse(row.files_found)).toEqual(['src/auth.ts']);
    expect(JSON.parse(row.commands_run)).toEqual(['npm test']);
    const turns = JSON.parse(row.raw_turns);
    expect(turns[0]).toEqual({ type: 'user', message: { role: 'user', content: 'mensaje 1' } });
    expect(turns.at(-1)).toEqual({ type: 'assistant', message: { role: 'assistant', content: 'respuesta 3' } });
  });

  it('no escribe un snapshot vacío si la sesión no tiene estado', () => {
    const r = runHook('on-compact.js', fixture('pre-compact', { session_id: 'sess-compact-empty' }));
    expect(JSON.parse(r.stdout)).toEqual({});
    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const row = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('sess-compact-empty');
    db.close();
    expect(row).toBeUndefined();
  });

  it('retorna {} y registra el contrato roto si falta trigger', () => {
    const { trigger: _omit, ...payload } = fixture('pre-compact', { session_id: 'sess-compact-001' });
    const r = runHook('on-compact.js', payload);
    expect(JSON.parse(r.stdout)).toEqual({});
    expect(lastLogLines()).toMatch(/\[on-compact\] Contrato: faltan campos trigger en PreCompact/);
  });

  it('retorna {} silencioso cuando no hay proyecto activo', () => {
    playTurns('sess-no-proj', 1, { MEMPUNK_CHECKPOINT_INTERVAL: '100' });
    const activeFile = path.join(MEMPUNK_DIR, 'active-project.json');
    const backup = fs.readFileSync(activeFile, 'utf8');
    fs.unlinkSync(activeFile);
    // El estado guardó testproj en el primer turno: se borra para probar el caso sin proyecto
    const statePath = path.join(SESSIONS_DIR, 'sess-no-proj.json');
    fs.writeFileSync(statePath, JSON.stringify({ ...readState('sess-no-proj'), project_id: null }));
    try {
      const r = runHook('on-compact.js', fixture('pre-compact', { session_id: 'sess-no-proj' }));
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toEqual({});
      const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
      const row = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('sess-no-proj');
      db.close();
      expect(row).toBeUndefined();
    } finally {
      fs.writeFileSync(activeFile, backup);
    }
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
  const env = { MEMPUNK_CHECKPOINT_INTERVAL: '5' };

  it('guarda last_assistant_message sin checkpoint cuando turno < INTERVAL', () => {
    playTurns('sess-stop-new', 2, env);
    const state = readState('sess-stop-new');
    expect(state.recent_messages.at(-1)).toEqual({ role: 'assistant', text: 'respuesta 2' });
    expect(checkpointRows('sess-stop-new')).toHaveLength(0);
  });

  it('guarda checkpoint desde el estado cuando turno >= INTERVAL', () => {
    // Los tests de auto-start dejan otro proyecto activo global
    fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-stop-save' }));
    playTurns('sess-stop-save', 5, env);

    const rows = checkpointRows('sess-stop-save');
    expect(rows).toHaveLength(1);
    expect(rows[0].turn_count).toBe(5);
    expect(rows[0].project_id).toBe('testproj');
    expect(JSON.parse(rows[0].files_found)).toEqual(['src/auth.ts']);
    expect(JSON.parse(rows[0].raw_turns)).toHaveLength(10);
    expect(readState('sess-stop-save').last_checkpoint_turn).toBe(5);
  });

  it('no guarda de nuevo hasta completar otros INTERVAL turnos', () => {
    runHook('on-stop.js', fixture('stop', { session_id: 'sess-stop-save' }), env);
    expect(checkpointRows('sess-stop-save')).toHaveLength(1);

    playTurns('sess-stop-save', 5, env);
    expect(checkpointRows('sess-stop-save').map((r) => r.turn_count)).toEqual([5, 10]);
  });

  it('un Stop sin UserPromptSubmit previo no cuenta como turno', () => {
    for (let i = 0; i < 8; i++) {
      runHook('on-stop.js', fixture('stop', { session_id: 'sess-stop-only' }), env);
    }
    expect(readState('sess-stop-only').turns).toBe(0);
    expect(checkpointRows('sess-stop-only')).toHaveLength(0);
  });

  it('sin last_assistant_message lo registra pero sigue contando hacia el checkpoint', () => {
    for (let i = 0; i < 5; i++) {
      runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-stop-contract' }), env);
    }
    const { last_assistant_message: _omit, ...payload } = fixture('stop', { session_id: 'sess-stop-contract' });
    const r = runHook('on-stop.js', payload, env);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');
    expect(lastLogLines()).toMatch(/\[on-stop\] Contrato: falta last_assistant_message en Stop/);
    expect(checkpointRows('sess-stop-contract')).toHaveLength(1);
  });

  it('un estado con tipos inesperados vuelve a los valores por defecto en vez de fallar', () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS_DIR, 'sess-bad-types.json'),
      JSON.stringify({ turns: '5', files_touched: null, recent_messages: 'x', first_prompt: '' }));
    runHook('on-prompt.js', fixture('user-prompt-submit', { session_id: 'sess-bad-types' }), env);
    runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'sess-bad-types' }), env);

    const state = readState('sess-bad-types');
    expect(state.turns).toBe(1);
    expect(state.files_touched).toEqual(['src/auth.ts']);
    expect(state.recent_messages).toHaveLength(1);
    expect(state.first_prompt).toBe('implementa el login con JWT');
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

    playTurns('sess-cwd-map', 5, env, { cwd: repoDir });

    const rows = checkpointRows('sess-cwd-map');
    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('cwdproj');

    fs.rmSync(repoDir, { recursive: true, force: true });
  });

  it('cae al proyecto activo global cuando el cwd no está mapeado', () => {
    playTurns('sess-cwd-fallback', 5, env, { cwd: path.join(os.tmpdir(), `dir-sin-mapear-${Date.now()}`) });
    const rows = checkpointRows('sess-cwd-fallback');
    expect(rows).toHaveLength(1);
    expect(rows[0].project_id).toBe('testproj');
  });

  it('las sesiones concurrentes llevan contadores independientes', () => {
    playTurns('sess-conc-a', 3, env);
    playTurns('sess-conc-b', 5, env);
    playTurns('sess-conc-a', 2, env);

    expect(readState('sess-conc-a').turns).toBe(5);
    expect(readState('sess-conc-b').turns).toBe(5);
    expect(checkpointRows('sess-conc-a')).toHaveLength(1);
    expect(checkpointRows('sess-conc-b')).toHaveLength(1);
  });

  it('el coste no depende del transcript: un transcript enorme e ilegible no cambia nada', () => {
    const hugeTranscript = path.join(MEMPUNK_DIR, 'huge.jsonl');
    fs.writeFileSync(hugeTranscript, 'no-json\n'.repeat(200_000));
    playTurns('sess-huge', 5, env, { transcript_path: hugeTranscript });
    expect(checkpointRows('sess-huge')).toHaveLength(1);
    fs.rmSync(hugeTranscript, { force: true });
  });
});

// ── on-start.js: limpieza de estados ──────────────────────────────────────────

describe('on-start.js (limpieza de estados de sesión)', () => {
  it('borra los estados con más de 7 días y conserva los recientes', () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    const oldFile = path.join(SESSIONS_DIR, 'sess-vieja.json');
    const newFile = path.join(SESSIONS_DIR, 'sess-reciente.json');
    fs.writeFileSync(oldFile, '{}');
    fs.writeFileSync(newFile, '{}');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(oldFile, eightDaysAgo, eightDaysAgo);

    const r = runHook('on-start.js', { session_id: 'sess-x', source: 'startup' });
    expect(r.status).toBe(0);
    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(newFile)).toBe(true);
  });
});

// ── on-end.js: registro de sesión automático (Fase 3B) ────────────────────────

describe('on-end.js (registro de sesión automático)', () => {
  // cwd fuera de project-paths: el proyecto sale del active-project (testproj)
  const END_CWD = path.join(os.tmpdir(), `mempunk-end-cwd-${Date.now()}`);

  function sessionRows() {
    const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
    const rows = db.prepare("SELECT * FROM session_log WHERE project_id = 'testproj' ORDER BY ended_at").all();
    db.close();
    return rows;
  }

  function endSession(sessionId) {
    return runHook('on-end.js', fixture('stop', { session_id: sessionId, cwd: END_CWD, reason: 'prompt_input_exit' }));
  }

  function editFile(sessionId, filePath) {
    runHook('on-tool.js', fixture('post-tool-use-edit', {
      session_id: sessionId, cwd: END_CWD, tool_input: { file_path: filePath },
    }));
  }

  it('cerrar sin guardar deja un registro automático con los archivos editados (criterio de salida)', () => {
    const before = sessionRows().length;
    playTurns('end-a', 2, {}, { cwd: END_CWD });
    editFile('end-a', path.join(END_CWD, 'src', 'login.js'));

    const r = endSession('end-a');
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe('');

    const rows = sessionRows();
    expect(rows).toHaveLength(before + 1);
    const auto = rows.at(-1);
    expect(auto.auto).toBe(1);
    expect(auto.started_at).toBe(readState('end-a').started_at);
    expect(JSON.parse(auto.files_touched)).toEqual(['src/login.js']);
    expect(auto.summary).toContain('mensaje 1');
    expect(auto.summary).toContain('respuesta 2');
  });

  it('volver a cerrar la misma sesión (resume) actualiza el registro en vez de duplicarlo', () => {
    const before = sessionRows().length;
    editFile('end-a', path.join(END_CWD, 'src', 'logout.js'));
    expect(endSession('end-a').status).toBe(0);

    const rows = sessionRows();
    expect(rows).toHaveLength(before);
    expect(JSON.parse(rows.at(-1).files_touched)).toEqual(['src/login.js', 'src/logout.js']);
  });

  it('si el agente ya registró la sesión, solo le añade los archivos', () => {
    playTurns('end-b', 1, {}, { cwd: END_CWD });
    editFile('end-b', path.join(END_CWD, 'src', 'pago.js'));
    expect(runCli('session log testproj Resumen-del-agente').status).toBe(0);
    const before = sessionRows().length;

    expect(endSession('end-b').status).toBe(0);

    const rows = sessionRows();
    expect(rows).toHaveLength(before);
    const manual = rows.find((row) => row.summary === 'Resumen-del-agente');
    expect(manual.auto).toBe(0);
    expect(JSON.parse(manual.files_touched)).toEqual(['src/pago.js']);
  });

  it('una sesión sin turnos ni archivos no deja registro', () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS_DIR, 'end-vacia.json'), JSON.stringify({ started_at: new Date().toISOString() }));
    const before = sessionRows().length;
    expect(endSession('end-vacia').status).toBe(0);
    expect(sessionRows()).toHaveLength(before);
  });

  describe('modo auto_session (.mempunk/settings.json)', () => {
    const SETTINGS = path.join(MEMPUNK_DIR, 'settings.json');
    afterEach(() => fs.rmSync(SETTINGS, { force: true }));

    function closeWithFile(sessionId, settings) {
      if (settings !== undefined) fs.writeFileSync(SETTINGS, settings);
      playTurns(sessionId, 2, {}, { cwd: END_CWD });
      editFile(sessionId, path.join(END_CWD, 'src', `${sessionId}.js`));
      const before = sessionRows().length;
      expect(endSession(sessionId).status).toBe(0);
      const rows = sessionRows();
      return { added: rows.length - before, row: rows.at(-1) };
    }

    // En minimal el resumen es solo la cabecera: una línea "[auto] … (N …)"
    function expectHeaderOnly(row) {
      expect(row.summary).toMatch(/^\[auto\] [^\n]*\(2 [^\n]*$/);
    }

    it('minimal registra turnos y archivos sin extractos de la conversación', () => {
      const { added, row } = closeWithFile('mode-min', JSON.stringify({ auto_session: 'minimal' }));
      expect(added).toBe(1);
      expect(row.auto).toBe(1);
      expect(JSON.parse(row.files_touched)).toEqual(['src/mode-min.js']);
      expectHeaderOnly(row);
    });

    it('off no escribe el registro automático', () => {
      const { added } = closeWithFile('mode-off', JSON.stringify({ auto_session: 'off' }));
      expect(added).toBe(0);
    });

    it('full explícito guarda los extractos como hasta ahora', () => {
      const { row } = closeWithFile('mode-full', JSON.stringify({ auto_session: 'full' }));
      expect(row.summary).toContain('mensaje 1');
      expect(row.summary).toContain('respuesta 2');
    });

    it('minimal: checkpoint y snapshot sin mensajes, con archivos y comandos', () => {
      fs.writeFileSync(SETTINGS, JSON.stringify({ auto_session: 'minimal' }));
      fs.writeFileSync(path.join(MEMPUNK_DIR, 'active-project.json'), JSON.stringify({ project_id: 'testproj' }));
      runHook('on-tool.js', fixture('post-tool-use-edit', { session_id: 'mode-snap' }));
      runHook('on-tool.js', fixture('post-tool-use-bash', { session_id: 'mode-snap' }));
      playTurns('mode-snap', 2, { MEMPUNK_CHECKPOINT_INTERVAL: '2' });
      runHook('on-compact.js', fixture('pre-compact', { session_id: 'mode-snap' }));

      const checkpoints = checkpointRows('mode-snap');
      expect(checkpoints).toHaveLength(1);
      expect(JSON.parse(checkpoints[0].raw_turns)).toEqual([]);
      expect(JSON.parse(checkpoints[0].files_found)).toEqual(['src/auth.ts']);

      const db = new Database(path.join(MEMPUNK_DIR, 'mempunk.db'));
      const snap = db.prepare('SELECT * FROM compact_snapshots WHERE session_id = ?').get('mode-snap');
      db.close();
      expect(JSON.parse(snap.raw_turns)).toEqual([]);
      expect(snap.message_count).toBe(0);
      expect(JSON.parse(snap.files_found)).toEqual(['src/auth.ts']);
      expect(JSON.parse(snap.commands_run)).toEqual(['npm test']);
    });

    it('settings.json vacío o sin la clave usa full', () => {
      expect(closeWithFile('mode-empty', '  \n').row.summary).toContain('respuesta 2');
      expect(closeWithFile('mode-nokey', JSON.stringify({ otra: 1 })).row.summary).toContain('respuesta 2');
    });

    it('un valor desconocido cae a minimal (sin extractos) y se anota en hooks.log', () => {
      const { added, row } = closeWithFile('mode-bad', JSON.stringify({ auto_session: 'todo' }));
      expect(added).toBe(1);
      expectHeaderOnly(row);
      expect(fs.readFileSync(path.join(MEMPUNK_DIR, 'hooks.log'), 'utf8')).toMatch(/auto_session inválido/);
    });

    it.each([
      ['mode-null', 'null'],
      ['mode-array', '[]'],
      ['mode-nullval', JSON.stringify({ auto_session: null })],
      ['mode-broken', '{no es json'],
    ])('%s: JSON que no es un objeto válido cae a minimal', (sessionId, content) => {
      const { added, row } = closeWithFile(sessionId, content);
      expect(added).toBe(1);
      expectHeaderOnly(row);
    });

    it('settings.json que no se puede leer (es un directorio) cae a minimal', () => {
      fs.mkdirSync(SETTINGS);
      try {
        const { added, row } = closeWithFile('mode-dir');
        expect(added).toBe(1);
        expectHeaderOnly(row);
      } finally {
        fs.rmSync(SETTINGS, { recursive: true, force: true });
      }
    });

    it('tolera el BOM de UTF-8 (settings.json guardado desde PowerShell)', () => {
      const { added } = closeWithFile('mode-bom', '\uFEFF' + JSON.stringify({ auto_session: 'off' }));
      expect(added).toBe(0);
    });
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
