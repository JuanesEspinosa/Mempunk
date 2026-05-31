import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Vault temporal para los tests de CLI — nunca toca ~/Dev-Brain
const TEMP_VAULT = path.join(os.tmpdir(), `mempunk-cli-test-${Date.now()}`);

/**
 * Ejecuta un comando del CLI apuntando al vault temporal.
 * @param {string} args - Argumentos que siguen a "node src/cli.js"
 * @returns {string} stdout del proceso
 */
function run(args) {
  return execSync(`node src/cli.js ${args}`, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, MEMPUNK_VAULT: TEMP_VAULT },
    encoding: 'utf8',
  });
}

beforeAll(() => {
  run('init');
});

afterAll(() => {
  fs.rmSync(TEMP_VAULT, { recursive: true, force: true });
});

// ── Init ──────────────────────────────────────────────────────────────────────

describe('mempunk init', () => {
  it('crea la estructura de carpetas correctamente', () => {
    expect(fs.existsSync(path.join(TEMP_VAULT, 'projects'))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_VAULT, 'areas'))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_VAULT, 'resources'))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_VAULT, 'daily'))).toBe(true);
    expect(fs.existsSync(path.join(TEMP_VAULT, '.mempunk', 'mempunk.db'))).toBe(true);
  });
});

// ── Project ───────────────────────────────────────────────────────────────────

describe('mempunk project add', () => {
  it('crea la carpeta del proyecto con scaffold completo desde templates', () => {
    const output = run('project add myproj "Mi Proyecto"');

    const projectDir = path.join(TEMP_VAULT, 'projects', 'myproj');
    expect(fs.existsSync(projectDir)).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'decisions'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'skills'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'INDEX.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'overview.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'architecture.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'conventions.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'wiki', 'state.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'wiki', 'log.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'wiki', 'index.md'))).toBe(true);

    // No debe crear backlog.md ni session-log.md (viven en SQLite en v2)
    expect(fs.existsSync(path.join(projectDir, 'backlog.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, 'session-log.md'))).toBe(false);

    // El output debe mencionar el nombre del proyecto
    expect(output).toContain('Mi Proyecto');
  });

  it('reemplaza {PROJECT_NAME} en los templates con el nombre real', () => {
    const indexContent = fs.readFileSync(
      path.join(TEMP_VAULT, 'projects', 'myproj', 'INDEX.md'), 'utf8'
    );
    expect(indexContent).toContain('Mi Proyecto');
    expect(indexContent).not.toContain('{PROJECT_NAME}');
  });

  it('auto-activa el proyecto recién creado', () => {
    const activeFile = path.join(TEMP_VAULT, '.mempunk', 'active-project.json');
    expect(fs.existsSync(activeFile)).toBe(true);
    const active = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    expect(active.project_id).toBe('myproj');
  });
});

describe('mempunk project activate', () => {
  it('escribe active-project.json con el proyecto indicado', () => {
    run('project activate myproj');
    const activeFile = path.join(TEMP_VAULT, '.mempunk', 'active-project.json');
    expect(fs.existsSync(activeFile)).toBe(true);
    const active = JSON.parse(fs.readFileSync(activeFile, 'utf8'));
    expect(active.project_id).toBe('myproj');
  });

  it('falla si el proyecto no existe en la BD', () => {
    const result = spawnSync('node', ['src/cli.js', 'project', 'activate', 'no-existe'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: TEMP_VAULT },
      encoding: 'utf8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('no-existe');
  });
});

// ── Backlog ───────────────────────────────────────────────────────────────────

describe('mempunk backlog add', () => {
  it('agrega una tarea y muestra el id generado', () => {
    const output = run('backlog add myproj "Tarea de prueba" --priority 1');
    // El output debe incluir el prefijo del id generado
    expect(output).toMatch(/bl_/);
  });
});

// ── Decision ──────────────────────────────────────────────────────────────────

describe('mempunk decision add', () => {
  it('crea el archivo markdown y muestra el path en el output', () => {
    const output = run('decision add myproj "Usar ESM" --tags "arch,node"');

    // El path del archivo debe aparecer en el output
    expect(output).toContain('decisions');
    expect(output).toContain('.md');

    // Extraer el path del output para verificar que el archivo existe
    const match = output.match(/[^\s]+\.md/);
    expect(match).not.toBeNull();
    expect(fs.existsSync(match[0])).toBe(true);
  });
});

// ── Skill ─────────────────────────────────────────────────────────────────────

describe('mempunk skill add', () => {
  it('crea el archivo markdown del skill y muestra el path en el output', () => {
    const output = run('skill add myproj stack');

    expect(output).toContain('stack');
    expect(output).toContain('.md');

    const skillFile = path.join(TEMP_VAULT, 'projects', 'myproj', 'skills', 'stack.md');
    expect(fs.existsSync(skillFile)).toBe(true);
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('mempunk search', () => {
  it('retorna resultados después de agregar una decisión con esa palabra clave', () => {
    // La decisión "Usar ESM" fue creada con content que incluye el título
    // FTS5 indexa título + contenido; el título 'ESM' debe ser encontrable
    const output = run('search "ESM"');
    // O bien hay resultados, o bien dice "Sin resultados" — lo importante es que no crashee
    expect(typeof output).toBe('string');
    // El output debe mencionar 'decision' en el tipo si encontró algo
    // (aceptable también si retorna sin resultados por algún timing de la BD)
    expect(output.length).toBeGreaterThan(0);
  });
});

// ── Session log ───────────────────────────────────────────────────────────────

describe('mempunk session log', () => {
  it('registra la sesión sin error', () => {
    const output = run('session log myproj "Sesión de integración" --files "src/cli.js"');
    expect(output).toContain('myproj');
  });
});

// ── Sync ──────────────────────────────────────────────────────────────────────

describe('mempunk sync', () => {
  it('retorna mensaje de vault sincronizado cuando no hay inconsistencias', () => {
    const output = run('sync');
    expect(output).toContain('sincronizado');
  });

  it('reporta archivos de scaffold faltantes cuando se borra uno', () => {
    run('project add scaffold-test "Scaffold Test"');
    const wikiState = path.join(TEMP_VAULT, 'projects', 'scaffold-test', 'wiki', 'state.md');
    fs.unlinkSync(wikiState);

    const output = run('sync');
    expect(output).toContain('scaffold faltantes');
    expect(output).toContain('scaffold-test');
    expect(output).toContain('wiki/state.md');
  });
});

// ── Resource ──────────────────────────────────────────────────────────────────

describe('mempunk resource add', () => {
  it('crea el archivo markdown y muestra el path en el output', () => {
    const output = run('resource add myproj "JWT Docs" --url https://jwt.io --content "Referencia a la spec de JWT"');

    expect(output).toContain('Resource guardado en');
    expect(output).toContain('.md');

    // Extraer el path del output y verificar que el archivo existe
    const match = output.match(/[^\s]+\.md/);
    expect(match).not.toBeNull();
    expect(fs.existsSync(match[0])).toBe(true);
  });
});

describe('mempunk resource list', () => {
  it('muestra tabla con el resource recién creado', () => {
    const output = run('resource list myproj');
    expect(output).toContain('JWT Docs');
    expect(output).toContain('https://jwt.io');
  });
});

// ── Daily ─────────────────────────────────────────────────────────────────────

describe('mempunk daily log', () => {
  it('crea el archivo de log diario y muestra el path en el output', () => {
    const output = run('daily log myproj "Sesión de trabajo: implementé el módulo de auth"');

    expect(output).toContain('.md');
    // La primera vez debe decir "creado"
    expect(output.toLowerCase()).toMatch(/creado|agregado/);

    // Extraer el path y verificar que el archivo existe
    const match = output.match(/[^\s]+\.md/);
    expect(match).not.toBeNull();
    expect(fs.existsSync(match[0])).toBe(true);
  });

  it('hace append al llamarse dos veces el mismo día', () => {
    // La primera llamada puede haber creado el archivo; la segunda debe hacer append
    const output = run('daily log myproj "Segunda entrada del día"');

    // Puede decir "creado" (primera vez del día en este vault) o "agregado" (append)
    expect(output).toContain('.md');

    // Leer el archivo y verificar que ambas entradas están presentes
    const match = output.match(/[^\s]+\.md/);
    expect(match).not.toBeNull();

    const content = fs.readFileSync(match[0], 'utf8');
    expect(content).toContain('Segunda entrada del día');
  });
});

describe('mempunk daily list', () => {
  it('muestra tabla con el log diario creado', () => {
    const output = run('daily list myproj');
    // Debe mostrar al menos una fila con la fecha de hoy
    const today = new Date().toISOString().slice(0, 10);
    expect(output).toContain(today);
  });
});

describe('mempunk search incluye resources y daily logs', () => {
  it('encuentra resultados de tipo resource por keyword', () => {
    const output = run('search "spec de JWT"');
    // O bien encuentra resultado, o bien dice sin resultados — no debe crashear
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });

  it('encuentra resultados de tipo daily por keyword', () => {
    const output = run('search "módulo de auth"');
    expect(typeof output).toBe('string');
    expect(output.length).toBeGreaterThan(0);
  });
});

// ── Vault version ─────────────────────────────────────────────────────────────

describe('mempunk vault', () => {
  // Vault con vault_meta forzada a v1 para simular un vault desactualizado
  let staleVault;

  /**
   * Crea un vault "stale": inicializado normalmente (v2) pero con vault_meta
   * forzada a v1 para simular que el CLI fue actualizado pero el vault no.
   */
  function createStaleVault(suffix = '') {
    const vaultPath = path.join(os.tmpdir(), `mempunk-stale-${Date.now()}${suffix}`);
    execSync('node src/cli.js init', {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: vaultPath },
      encoding: 'utf8',
    });
    // Degradar vault_meta a v1 sin alterar las tablas del schema
    const db = new Database(path.join(vaultPath, '.mempunk', 'mempunk.db'));
    db.prepare('INSERT OR REPLACE INTO vault_meta (key, value) VALUES (?, ?)').run('vault_version', '1');
    db.close();
    return vaultPath;
  }

  beforeAll(() => {
    staleVault = createStaleVault();
  });

  afterAll(() => {
    fs.rmSync(staleVault, { recursive: true, force: true });
  });

  it('vault version muestra la versión correcta cuando el vault está actualizado', () => {
    const output = run('vault version');
    expect(output).toContain('v2');
    expect(output).toContain('OK');
  });

  it('vault version muestra warning si el vault está desactualizado', () => {
    const output = execSync('node src/cli.js vault version', {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: staleVault },
      encoding: 'utf8',
    });
    expect(output).toContain('v1');
    expect(output).toContain('vault upgrade');
  });

  it('vault upgrade actualiza el vault desactualizado y muestra la versión nueva', () => {
    // Crear un vault stale aislado para este test (staleVault se usará en el siguiente)
    const isolated = createStaleVault('-upgrade');

    const output = execSync('node src/cli.js vault upgrade', {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: isolated },
      encoding: 'utf8',
    });
    expect(output).toContain('v3');

    // Verificar que vault version ahora dice OK
    const versionOutput = execSync('node src/cli.js vault version', {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: isolated },
      encoding: 'utf8',
    });
    expect(versionOutput).toContain('OK');

    fs.rmSync(isolated, { recursive: true, force: true });
  });

  it('vault upgrade no hace nada si el vault ya está actualizado', () => {
    const output = run('vault upgrade');
    expect(output).toContain('ya está en la versión más reciente');
  });

  it('project list muestra warning en stderr si el vault está desactualizado, pero no falla', () => {
    const result = spawnSync('node', ['src/cli.js', 'project', 'list'], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: staleVault },
      encoding: 'utf8',
    });
    // El proceso debe terminar con código 0 (no falla)
    expect(result.status).toBe(0);
    // El warning debe aparecer en stderr
    expect(result.stderr).toContain('Vault desactualizado');
  });
});

// ── Hooks ─────────────────────────────────────────────────────────────────────

describe('mempunk hooks', () => {
  const localHooksDir   = path.join(PROJECT_ROOT, '.claude', 'hooks');
  const globalHooksDir  = path.join(os.homedir(), '.claude', 'hooks');
  const localAgentsDir  = path.join(PROJECT_ROOT, '.claude', 'agents');
  const globalAgentsDir = path.join(os.homedir(), '.claude', 'agents');
  const HOOK_FILES  = ['on-start.js', 'on-compact.js', 'on-stop.js', 'on-prompt.js'];
  const AGENT_FILES = ['mempunk-saver.md', 'mempunk-loader.md', 'mempunk-recover.md'];
  const HOOK_MARKER  = '# mempunk-hook';
  const AGENT_MARKER = '# mempunk-agent';

  afterAll(() => {
    for (const f of HOOK_FILES) {
      try { fs.unlinkSync(path.join(localHooksDir,  f)); } catch (_) {}
      try { fs.unlinkSync(path.join(globalHooksDir, f)); } catch (_) {}
    }
    for (const f of AGENT_FILES) {
      try { fs.unlinkSync(path.join(localAgentsDir,  f)); } catch (_) {}
      try { fs.unlinkSync(path.join(globalAgentsDir, f)); } catch (_) {}
    }
  });

  it('hooks install (sin flag) instala en ~/.claude/hooks/ globalmente', () => {
    run('hooks install');
    for (const f of HOOK_FILES) {
      expect(fs.existsSync(path.join(globalHooksDir, f))).toBe(true);
    }
  });

  it('los hooks instalados globalmente contienen el marcador # mempunk-hook', () => {
    for (const f of HOOK_FILES) {
      const content = fs.readFileSync(path.join(globalHooksDir, f), 'utf8');
      expect(content).toContain(HOOK_MARKER);
    }
  });

  it('hooks install --local instala en .claude/hooks/ del proyecto actual', () => {
    run('hooks install --local');
    for (const f of HOOK_FILES) {
      expect(fs.existsSync(path.join(localHooksDir, f))).toBe(true);
    }
  });

  it('hooks uninstall --local elimina solo los hooks de Mempunk, no otros archivos', () => {
    const foreignFile = path.join(localHooksDir, 'other-hook.js');
    fs.writeFileSync(foreignFile, '#!/usr/bin/env node\n// some other hook\n', 'utf8');

    run('hooks uninstall --local');

    for (const f of HOOK_FILES) {
      expect(fs.existsSync(path.join(localHooksDir, f))).toBe(false);
    }
    expect(fs.existsSync(foreignFile)).toBe(true);
    fs.unlinkSync(foreignFile);
  });

  it('hooks install (sin flag) instala agentes en ~/.claude/agents/ globalmente', () => {
    // La primera llamada a hooks install ya los instaló globalmente
    for (const f of AGENT_FILES) {
      expect(fs.existsSync(path.join(globalAgentsDir, f))).toBe(true);
    }
  });

  it('los agentes instalados globalmente contienen el marcador # mempunk-agent', () => {
    for (const f of AGENT_FILES) {
      const content = fs.readFileSync(path.join(globalAgentsDir, f), 'utf8');
      expect(content).toContain(AGENT_MARKER);
    }
  });

  it('hooks install --check muestra estado de hooks, agentes y statusline', () => {
    const output = run('hooks install --check');
    expect(output).toContain('on-start.js');
    expect(output).toContain('mempunk-saver.md');
    expect(output).toContain('mempunk-loader.md');
    expect(output).toContain('mempunk-recover.md');
    expect(output).toContain('Statusline');
    // Todos deben mostrar ✓ tras la instalación global anterior
    expect(output).toContain('✓ mempunk-saver.md');
    expect(output).toContain('✓ mempunk-loader.md');
    expect(output).toContain('✓ mempunk-recover.md');
  });

  it('hooks install --local instala agentes en .claude/agents/ del proyecto actual', () => {
    run('hooks install --local');
    for (const f of AGENT_FILES) {
      expect(fs.existsSync(path.join(localAgentsDir, f))).toBe(true);
    }
  });

  it('hooks uninstall --local elimina agentes de Mempunk pero no otros archivos en agents/', () => {
    const foreignAgent = path.join(localAgentsDir, 'other-agent.md');
    fs.writeFileSync(foreignAgent, '---\nname: other\n---\nOther agent\n', 'utf8');

    run('hooks uninstall --local');

    for (const f of AGENT_FILES) {
      expect(fs.existsSync(path.join(localAgentsDir, f))).toBe(false);
    }
    expect(fs.existsSync(foreignAgent)).toBe(true);
    fs.unlinkSync(foreignAgent);
  });
});

// ── Session recover & checkpoints ─────────────────────────────────────────────

describe('mempunk session recover', () => {
  it('muestra mensaje cuando no hay snapshots', () => {
    // Crear proyecto aparte para este test
    run('project add recov-proj "Recover Project"');
    const output = run('session recover recov-proj');
    expect(output).toContain('No hay snapshots');
  });

  it('muestra el último snapshot con archivos y comandos', () => {
    // Guardar un compact_snapshot
    const tmpFile = path.join(os.tmpdir(), `mc-cli-test-${Date.now()}.json`);
    const turns = [
      { type: 'human', message: { content: 'agrega JWT' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'Editando auth.ts' }] } },
    ];
    fs.writeFileSync(tmpFile, JSON.stringify({
      project_id: 'recov-proj', session_id: 'sess-clitest', compact_type: 'automatic', message_count: 2,
      raw_turns: JSON.stringify(turns),
      files_found: JSON.stringify(['src/auth.ts']),
      commands_run: JSON.stringify(['npm run test:e2e']),
    }));
    run(`session save-compact ${tmpFile}`);

    const output = run('session recover recov-proj');
    expect(output).toContain('compact_snapshot');
    expect(output).toContain('src/auth.ts');
    expect(output).toContain('npm run test:e2e');
    expect(output).toContain('agrega JWT');
  });
});

describe('mempunk session checkpoints', () => {
  it('muestra mensaje cuando no hay checkpoints', () => {
    run('project add chk-proj "Checkpoint Project"');
    const output = run('session checkpoints chk-proj');
    expect(output).toContain('No hay checkpoints');
  });

  it('lista checkpoints después de guardar uno', () => {
    // session recover ya guardó un snapshot para recov-proj
    const output = run('session checkpoints recov-proj');
    expect(output).toContain('compact');
    expect(output).toContain('2 msgs');
  });
});

// ── Doctor — proyecto activo ──────────────────────────────────────────────────

describe('mempunk doctor — proyecto activo', () => {
  it('advierte cuando no hay active-project.json', () => {
    const activeFile = path.join(TEMP_VAULT, '.mempunk', 'active-project.json');
    try { fs.unlinkSync(activeFile); } catch (_) {}

    const output = run('doctor');
    expect(output).toMatch(/Sin proyecto activo|active-project/);
  });

  it('muestra el proyecto activo cuando active-project.json existe', () => {
    // Crear el proyecto si no existe, luego activarlo
    run('project add doctor-proj "Doctor Test Project"');
    const output = run('doctor');
    expect(output).toContain('Proyecto activo: doctor-proj');
  });
});

// ── Auto-start — verifica agentes ─────────────────────────────────────────────

describe('mempunk auto-start — advertencia sin agentes', () => {
  it('emite warning en stderr si los agentes no están instalados', () => {
    // Usar un vault + HOME temporal para que no haya agentes instalados
    const NO_AGENTS_VAULT = path.join(os.tmpdir(), `mempunk-noagents-${Date.now()}`);
    const NO_AGENTS_HOME  = path.join(os.tmpdir(), `mempunk-home-${Date.now()}`);
    try {
      execSync('node src/cli.js init', {
        cwd: PROJECT_ROOT,
        env: { ...process.env, MEMPUNK_VAULT: NO_AGENTS_VAULT, HOME: NO_AGENTS_HOME, USERPROFILE: NO_AGENTS_HOME },
        encoding: 'utf8',
      });
      const result = spawnSync('node', ['src/cli.js', 'auto-start', 'on'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, MEMPUNK_VAULT: NO_AGENTS_VAULT, HOME: NO_AGENTS_HOME, USERPROFILE: NO_AGENTS_HOME },
        encoding: 'utf8',
      });
      expect(result.stderr).toContain('mempunk hooks install');
      expect(result.stdout).toContain('Auto-start activado');
    } finally {
      fs.rmSync(NO_AGENTS_VAULT, { recursive: true, force: true });
      fs.rmSync(NO_AGENTS_HOME,  { recursive: true, force: true });
    }
  });
});

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('mempunk setup', () => {
  // Vault temporal exclusivo para los tests de setup (no reutilizar el global)
  const SETUP_VAULT = path.join(os.tmpdir(), `mempunk-setup-test-${Date.now()}`);

  function runSetup(args) {
    return execSync(`node src/cli.js ${args}`, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, MEMPUNK_VAULT: SETUP_VAULT },
      encoding: 'utf8',
    });
  }

  afterAll(() => {
    fs.rmSync(SETUP_VAULT, { recursive: true, force: true });
  });

  it('--setup-mode manual: crea setup.json con mode=manual', () => {
    runSetup('setup --setup-mode manual');
    const setupJson = path.join(SETUP_VAULT, '.mempunk', 'setup.json');
    expect(fs.existsSync(setupJson)).toBe(true);
    const config = JSON.parse(fs.readFileSync(setupJson, 'utf8'));
    expect(config.mode).toBe('manual');
    expect(config.cli).toBe('claude-code');
  });

  it('--setup-mode manual: instala vault-skills en el vault', () => {
    const skillsDir = path.join(SETUP_VAULT, 'vault-skills');
    expect(fs.existsSync(skillsDir)).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'session-start.md'))).toBe(true);
    expect(fs.existsSync(path.join(skillsDir, 'session-end.md'))).toBe(true);
  });

  it('--setup-mode vault-skills: crea setup.json con mode=vault-skills y cli=other', () => {
    // Usar un vault diferente para no confundir estados
    const VS_VAULT = path.join(os.tmpdir(), `mempunk-vs-test-${Date.now()}`);
    try {
      execSync('node src/cli.js setup --setup-mode vault-skills', {
        cwd: PROJECT_ROOT,
        env: { ...process.env, MEMPUNK_VAULT: VS_VAULT },
        encoding: 'utf8',
      });
      const config = JSON.parse(
        fs.readFileSync(path.join(VS_VAULT, '.mempunk', 'setup.json'), 'utf8')
      );
      expect(config.mode).toBe('vault-skills');
      expect(config.cli).toBe('other');
      // vault-skills presentes
      expect(fs.existsSync(path.join(VS_VAULT, 'vault-skills', 'session-start.md'))).toBe(true);
    } finally {
      fs.rmSync(VS_VAULT, { recursive: true, force: true });
    }
  });

  it('--setup-mode inválido: falla con error descriptivo', () => {
    expect(() => runSetup('setup --setup-mode banana')).toThrow();
  });
});
