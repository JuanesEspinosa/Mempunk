import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// Todo vive bajo un directorio temporal: cada describe crea su propio fixture
// (vault, HOME, bare repo y clon) para que el orden de los tests no importe.
// Nunca toca ~/Dev-Brain ni la configuración git global del desarrollador.
const TEMP_BASE = path.join(os.tmpdir(), `mempunk-remote-test-${Date.now()}`);
const DB_REL    = path.join('.mempunk', 'mempunk.db');

const gitAvailable = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
const describeGit  = gitAvailable ? describe : describe.skip;

/** Fixture aislado: vault + HOME + bare + clon, con helpers ligados a su entorno */
function createFixture(name) {
  const root  = path.join(TEMP_BASE, name);
  const vault = path.join(root, 'vault');
  const home  = path.join(root, 'home');
  const bare  = path.join(root, 'remote.git');
  const clone = path.join(root, 'clone');
  const env = {
    ...process.env,
    MEMPUNK_LANG: 'es',
    MEMPUNK_VAULT: vault,
    HOME: home,
    USERPROFILE: home,
    GIT_AUTHOR_NAME: 'Mempunk Test',
    GIT_AUTHOR_EMAIL: 'test@mempunk.local',
    GIT_COMMITTER_NAME: 'Mempunk Test',
    GIT_COMMITTER_EMAIL: 'test@mempunk.local',
    GIT_CONFIG_GLOBAL: path.join(home, '.gitconfig'),
    GIT_CONFIG_NOSYSTEM: '1',
  };
  fs.mkdirSync(home, { recursive: true });
  fs.writeFileSync(path.join(home, '.gitconfig'), '[init]\n\tdefaultBranch = master\n');

  /** Ejecuta el CLI capturando status/stdout/stderr (opcionalmente con stdin) */
  const runRaw = (argv, input) =>
    spawnSync('node', ['src/cli.js', ...argv], { cwd: PROJECT_ROOT, env, encoding: 'utf8', input });

  /** Ejecuta el CLI y devuelve stdout; lanza si el exit code no es 0 */
  const run = (argv) => {
    const r = runRaw(argv);
    if (r.status !== 0) throw new Error(`mempunk ${argv.join(' ')} failed (${r.status}): ${r.stderr}\n${r.stdout}`);
    return r.stdout;
  };

  /** git con args en array, sin shell; lanza si falla */
  const git = (args, cwd) => {
    const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
    return r.stdout;
  };

  const fx = { root, vault, home, bare, clone, env, run, runRaw, git };
  fx.remoteJson  = () => path.join(vault, '.mempunk', 'remote.json');
  fx.stateJson   = () => path.join(vault, '.mempunk', 'remote-state.json');
  fx.backupsDir  = () => path.join(vault, '.mempunk', 'backups');
  fx.backups     = (prefix) => fs.readdirSync(fx.backupsDir()).filter((f) => f.startsWith(prefix) && f.endsWith('.db'));
  fx.bareLog     = (branch = 'main') => git(['log', '--format=%s', branch], bare);
  fx.vaultStatus = () => git(['status', '--porcelain'], vault).trim();

  /** init + proyecto + bare repo (main) — punto de partida de la mayoría de bloques */
  fx.bootstrap = () => {
    run(['init']);
    run(['project', 'add', 'myproj', 'Mi Proyecto']);
    git(['init', '--bare', bare], root);
  };

  /** Clona el bare (rama main) en fx.clone */
  fx.cloneRemote = () => git(['clone', '-b', 'main', bare, clone], root);

  /** Commit + push desde el clon */
  fx.pushFromClone = (message) => {
    git(['add', '-A'], clone);
    git(['commit', '-m', message], clone);
    git(['push', 'origin', 'main'], clone);
  };

  /** Inserta un daily_log con created_at arbitrario en la BD indicada y la checkpointea */
  fx.insertFutureDailyLog = (dbPath, id, createdAt) => {
    const db = new Database(dbPath);
    db.prepare(
      'INSERT INTO daily_logs (id, project_id, date, file_path, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, 'myproj', createdAt.slice(0, 10), `daily/${createdAt.slice(0, 10)}.md`, createdAt);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  };

  fx.vaultDbHasRow = (id) => {
    const db  = new Database(path.join(vault, DB_REL), { readonly: true });
    const row = db.prepare('SELECT id FROM daily_logs WHERE id = ?').get(id);
    db.close();
    return Boolean(row);
  };

  fx.vaultDailyLogCount = () => {
    const db = new Database(path.join(vault, DB_REL), { readonly: true });
    const n  = db.prepare('SELECT COUNT(*) AS n FROM daily_logs').get().n;
    db.close();
    return n;
  };

  return fx;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

afterAll(() => {
  fs.rmSync(TEMP_BASE, { recursive: true, force: true });
});

// ── Flujo básico: remote set / show / unset, push, pull, conflicto binario ────

describeGit('mempunk remote / push / pull — flujo básico', () => {
  let fx;
  let emptyRepo;

  beforeAll(() => {
    fx = createFixture('basic');
    fx.bootstrap();
    emptyRepo = path.join(fx.root, 'empty.git');
    fx.git(['init', '--bare', emptyRepo], fx.root);
  });

  it('push sin remote configurado falla con la instrucción para configurarlo', () => {
    const r = fx.runRaw(['push']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('mempunk remote set <url>');
  });

  it('remote set registra url y rama, inicializa git, escribe el .gitignore y avisa del repo privado', () => {
    const output = fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
    expect(output).toContain(fx.bare);
    expect(output).toContain('privado');

    const cfg = readJson(fx.remoteJson());
    expect(cfg.url).toBe(fx.bare);
    expect(cfg.branch).toBe('main');
    expect(cfg.auto).toEqual({ pull_on_start: false, push_on_end: false });

    expect(fx.git(['remote', 'get-url', 'origin'], fx.vault).trim()).toBe(fx.bare);
    expect(fx.git(['symbolic-ref', 'HEAD'], fx.vault).trim()).toBe('refs/heads/main');

    const ignore = fs.readFileSync(path.join(fx.vault, '.gitignore'), 'utf8');
    expect(ignore).toContain('.mempunk/remote-state.json');
    expect(ignore).toContain('.mempunk/mempunk.db-wal');
    expect(ignore).toContain('.mempunk/auto-start.flag');
  });

  it('remote show --json devuelve url y rama', () => {
    const data = JSON.parse(fx.run(['remote', 'show', '--json']));
    expect(data.url).toBe(fx.bare);
    expect(data.branch).toBe('main');
    expect(data.last_push_at).toBeNull();
  });

  it('remote unset elimina remote.json y conserva .git', () => {
    fx.run(['remote', 'unset']);
    expect(fs.existsSync(fx.remoteJson())).toBe(false);
    expect(fs.existsSync(path.join(fx.vault, '.git'))).toBe(true);

    const r = fx.runRaw(['remote', 'show']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('mempunk remote set <url>');
  });

  it('remote set --auto activa ambos flags y set-url actualiza el origin existente', () => {
    fx.run(['remote', 'set', emptyRepo, '--branch', 'main', '--auto']);
    const cfg = readJson(fx.remoteJson());
    expect(cfg.auto).toEqual({ pull_on_start: true, push_on_end: true });
    expect(fx.git(['remote', 'get-url', 'origin'], fx.vault).trim()).toBe(emptyRepo);
  });

  it('pull cuando la rama remota no existe termina con 0 y lo informa', () => {
    const r = fx.runRaw(['pull']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('origin/main');
    expect(r.stdout).toContain('no existe');
  });

  it('push -m --project sube el commit con el prefijo del proyecto y trackea la BD', () => {
    // Volver al bare real preservando el bloque auto ya configurado
    fx.run(['remote', 'set', fx.bare]);
    const cfg = readJson(fx.remoteJson());
    expect(cfg.auto).toEqual({ pull_on_start: true, push_on_end: true });

    const output = fx.run(['push', '-m', 'primera', '--project', 'myproj']);
    expect(output).toContain('origin/main');
    expect(fx.bareLog()).toContain('vault(myproj): primera');

    const tracked = fx.git(['ls-tree', '-r', '--name-only', 'main'], fx.bare);
    expect(tracked).toContain('.mempunk/mempunk.db');
    expect(tracked).toContain('.mempunk/remote.json');
    expect(tracked).not.toContain('mempunk.db-wal');
    expect(tracked).not.toContain('mempunk.db-shm');

    expect(typeof readJson(fx.stateJson()).last_push_at).toBe('string');
  });

  it('push sin cambios informa que no hay nada que subir y termina con 0', () => {
    const r = fx.runRaw(['push']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Nada que subir');
  });

  it('pull trae los commits del remoto y deja un backup previo', () => {
    fx.cloneRemote();
    fs.mkdirSync(path.join(fx.clone, 'areas'), { recursive: true });
    fs.writeFileSync(path.join(fx.clone, 'areas', 'from-clone.md'), '# desde el clon\n');
    fx.pushFromClone('docs: nota desde el clon');

    const output = fx.run(['pull']);
    expect(fs.existsSync(path.join(fx.vault, 'areas', 'from-clone.md'))).toBe(true);
    expect(output).toContain('1 commit');
    expect(fx.backups('mempunk-').length).toBeGreaterThan(0);

    const state = readJson(fx.stateJson());
    expect(typeof state.last_pull_at).toBe('string');
    expect(state.last_pull_commits).toBe(1);
  });

  it('push resuelve el conflicto de mempunk.db a favor de la BD con actividad más reciente', () => {
    fx.insertFutureDailyLog(path.join(fx.clone, DB_REL), 'dl_future_1', '2099-01-01T00:00:00.000Z');
    fx.pushFromClone('clone: daily del futuro');

    // El vault escribe en su BD sin haber hecho pull
    fx.run(['daily', 'log', 'myproj', 'local']);
    const output = fx.run(['push']);

    expect(output).toContain('theirs');
    expect(output).toContain('2099-01-01');
    expect(fx.vaultDbHasRow('dl_future_1')).toBe(true);
    expect(fx.backups('conflict-').filter((f) => f.includes('-ours')).length).toBe(1);
    expect(fx.git(['log', '--format=%s', '-n', '1', 'main'], fx.bare)).toMatch(/^Merge /);
  });

  it('push --strict resuelve el conflicto pero termina con 1', () => {
    fx.git(['pull', '--no-rebase', 'origin', 'main'], fx.clone);
    fx.insertFutureDailyLog(path.join(fx.clone, DB_REL), 'dl_future_2', '2099-02-01T00:00:00.000Z');
    fx.pushFromClone('clone: segundo daily del futuro');

    fx.run(['daily', 'log', 'myproj', 'local 2']);
    const r = fx.runRaw(['push', '--strict']);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('2099-02-01');
    expect(fx.vaultDbHasRow('dl_future_2')).toBe(true);

    // El merge quedó subido aunque el exit code sea 1
    expect(fx.git(['log', '--format=%s', '-n', '1', 'main'], fx.bare)).toMatch(/^Merge /);
  });

  it('pull con cambios locales sin commit los commitea antes del merge y los conserva (sin stash)', () => {
    const scratch = path.join(fx.vault, 'areas', 'scratch.md');
    fs.writeFileSync(scratch, '# borrador local\n');

    const r = fx.runRaw(['pull']);
    expect(r.status).toBe(0);
    expect(fs.readFileSync(scratch, 'utf8')).toContain('borrador local');
    expect(fx.git(['stash', 'list'], fx.vault).trim()).toBe('');
    expect(fx.git(['log', '--format=%s', '-n', '1'], fx.vault)).toContain('vault: local changes before pull');
    expect(fx.vaultStatus()).toBe('');
  });
});

// ── A. Pull offline no pierde datos ──────────────────────────────────────────

describeGit('pull sin red', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('offline');
    fx.bootstrap();
    // Primer push real para que exista HEAD; luego el remote "se cae"
    fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
    fx.run(['push', '-m', 'base']);
    fx.run(['remote', 'set', path.join(fx.root, 'does-not-exist.git'), '--branch', 'main']);
  });

  it('pull con el remote inaccesible falla sin tocar los cambios locales ni dejar stash', () => {
    fx.run(['daily', 'log', 'myproj', 'trabajo de hoy']);
    const note = path.join(fx.vault, 'areas', 'nota.md');
    fs.writeFileSync(note, '# nota local\n');

    const r = fx.runRaw(['pull']);
    expect(r.status).not.toBe(0);
    expect(r.stdout).not.toContain('✓');

    expect(fs.readFileSync(note, 'utf8')).toContain('nota local');
    expect(fx.vaultDailyLogCount()).toBe(1);
    expect(fx.git(['stash', 'list'], fx.vault).trim()).toBe('');
  });
});

// ── A. BD sucia + cambio remoto en la BD → regla de ganador, árbol limpio ─────

describeGit('pull con BD local modificada y BD remota distinta', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('dirty-db');
    fx.bootstrap();
    fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
    fx.run(['push', '-m', 'base']);
    fx.cloneRemote();
  });

  it('pull aplica la regla del ganador, deja el árbol limpio y guarda la perdedora', () => {
    fx.insertFutureDailyLog(path.join(fx.clone, DB_REL), 'dl_remote_2099', '2099-03-01T00:00:00.000Z');
    fx.pushFromClone('clone: fila del futuro');

    fx.run(['daily', 'log', 'myproj', 'cambio local sin commit']);
    const r = fx.runRaw(['pull']);

    expect(r.status).toBe(0);
    expect(r.stdout).toContain('theirs');
    expect(fx.vaultDbHasRow('dl_remote_2099')).toBe(true);
    expect(fx.vaultStatus()).toBe('');
    expect(fx.backups('conflict-').length).toBe(1);
  });
});

// ── A. Conflicto de texto sin resolver → push se niega ───────────────────────

describeGit('push con merge en curso', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('text-conflict');
    fx.bootstrap();
    fs.writeFileSync(path.join(fx.vault, 'areas', 'shared.md'), '# base\n');
    fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
    fx.run(['push', '-m', 'base']);
    fx.cloneRemote();
  });

  it('un conflicto de texto detiene el push y el siguiente push se niega hasta resolverlo', () => {
    fs.writeFileSync(path.join(fx.clone, 'areas', 'shared.md'), '# versión del clon\n');
    fx.pushFromClone('clone: edita shared');
    fs.writeFileSync(path.join(fx.vault, 'areas', 'shared.md'), '# versión local\n');

    const first = fx.runRaw(['push', '-m', 'local edita shared']);
    expect(first.status).toBe(1);
    expect(first.stderr).toContain('areas/shared.md');

    const second = fx.runRaw(['push']);
    expect(second.status).toBe(1);
    expect(second.stderr).toContain('merge en curso');
    expect(second.stderr).toContain('areas/shared.md');

    const remoteFile = fx.git(['show', 'main:areas/shared.md'], fx.bare);
    expect(remoteFile).not.toContain('<<<<<<<');
    expect(fx.bareLog()).not.toContain('local edita shared');
  });
});

// ── C. Validación de rama y URL ──────────────────────────────────────────────

describeGit('validación de rama y url', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('validation');
    fx.bootstrap();
  });

  it('remote set rechaza una rama que empieza con guion', () => {
    const r = fx.runRaw(['remote', 'set', fx.bare, '--branch', '--upload-pack=x']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Rama inválida');
    expect(fs.existsSync(fx.remoteJson())).toBe(false);
  });

  it('remote set rechaza una url con credenciales embebidas sin escribir remote.json', () => {
    const r = fx.runRaw(['remote', 'set', 'https://user:tok@example.com/r.git']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('credenciales');
    expect(r.stderr).not.toContain('tok@');
    expect(fs.existsSync(fx.remoteJson())).toBe(false);
  });

  it('remote set rechaza una url que empieza con guion o de forma desconocida', () => {
    expect(fx.runRaw(['remote', 'set', '--upload-pack=x']).status).toBe(1);
    expect(fx.runRaw(['remote', 'set', 'ftp://example.com/r.git']).status).toBe(1);
    expect(fs.existsSync(fx.remoteJson())).toBe(false);
  });

  it('remote set acepta ssh://git@host y enmascara el usuario en la salida y en --json', () => {
    const output = fx.run(['remote', 'set', 'ssh://git@example.com/r.git', '--branch', 'main']);
    expect(output).toContain('ssh://***@example.com/r.git');
    expect(output).not.toContain('git@example.com');
    const data = JSON.parse(fx.run(['remote', 'show', '--json']));
    expect(data.url).toBe('ssh://***@example.com/r.git');
    expect(fx.git(['remote', 'get-url', 'origin'], fx.vault).trim()).toBe('ssh://git@example.com/r.git');
  });

  it('pull con una rama manipulada en remote.json falla con rama inválida', () => {
    fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
    const cfg = readJson(fx.remoteJson());
    fs.writeFileSync(fx.remoteJson(), JSON.stringify({ ...cfg, branch: '--upload-pack=x' }, null, 2));

    const r = fx.runRaw(['pull']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Rama inválida');
  });

  it('push --project con caracteres no permitidos falla', () => {
    fs.writeFileSync(fx.remoteJson(), JSON.stringify({ ...readJson(fx.remoteJson()), branch: 'main' }, null, 2));
    const r = fx.runRaw(['push', '-m', 'x', '--project', 'bad id;rm']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('--project');
  });
});

// ── B. Mensaje de commit por stdin / archivo ─────────────────────────────────

describeGit('push con mensaje por stdin y archivo', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('message');
    fx.bootstrap();
    fx.run(['remote', 'set', fx.bare, '--branch', 'main']);
  });

  it('--message-stdin usa el texto literal sin expandirlo por el shell', () => {
    const input = 'hello $(echo INJECTED) `x` "q"';
    const r = fx.runRaw(['push', '--message-stdin', '--project', 'myproj'], input);
    expect(r.status).toBe(0);
    expect(fx.bareLog()).toContain('vault(myproj): hello $(echo INJECTED) `x` "q"');
  });

  it('--message-stdin elimina overrides bidi y controles C1/Unicode del mensaje', () => {
    fs.writeFileSync(path.join(fx.vault, 'areas', 'bidi.md'), '# bidi\n');
    const input = 'seguro\u202E odarbmac\u0085 fin\u2028 ok';
    const r = fx.runRaw(['push', '--message-stdin', '--project', 'myproj'], input);
    expect(r.status).toBe(0);
    const log = fx.bareLog();
    expect(log).toContain('vault(myproj): seguro odarbmac fin ok');
    expect(log).not.toMatch(/[\u202E\u0085\u2028]/);
  });

  it('--message-file lee el archivo y sanea BOM, CRLF y caracteres de control', () => {
    const file = path.join(fx.root, 'msg.txt');
    fs.writeFileSync(file, '\uFEFF  resumen con\r\ncontrol\u0001 chars\u0007  \n');
    fs.writeFileSync(path.join(fx.vault, 'areas', 'x.md'), '# x\n');

    fx.run(['push', '--message-file', file]);
    const body = fx.git(['log', '--format=%B', '-n', '1', 'main'], fx.bare);
    expect(body).toContain('vault: resumen con\ncontrol chars');
    expect(body).not.toContain('\u0001');
    expect(body).not.toContain('\uFEFF');
  });

  it('un mensaje vacío tras sanear usa el mensaje por defecto', () => {
    fs.writeFileSync(path.join(fx.vault, 'areas', 'y.md'), '# y\n');
    const r = fx.runRaw(['push', '--message-stdin'], '   ');
    expect(r.status).toBe(0);
    expect(fx.git(['log', '--format=%s', '-n', '1', 'main'], fx.bare)).toMatch(/^vault: session \d{4}-\d{2}-\d{2}/);
  });

  it('--message-file inexistente falla con un mensaje claro', () => {
    const r = fx.runRaw(['push', '--message-file', path.join(fx.root, 'nope.txt')]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('message-file');
  });
});

// ── C. Rama por defecto = rama activa del repo existente ─────────────────────

describeGit('remote set sobre un repo existente', () => {
  let fx;

  beforeAll(() => {
    fx = createFixture('existing-repo');
    fx.bootstrap();
    fx.git(['init'], fx.vault); // defaultBranch = master (gitconfig del fixture)
  });

  it('sin --branch usa la rama activa (master) y push funciona', () => {
    fx.run(['remote', 'set', fx.bare]);
    expect(readJson(fx.remoteJson()).branch).toBe('master');

    fx.run(['push', '-m', 'primera en master']);
    expect(fx.bareLog('master')).toContain('vault: primera en master');
  });

  it('un archivo ignorado que ya estaba trackeado deja de estarlo tras remote set', () => {
    const flag = path.join(fx.vault, '.mempunk', 'auto-start.flag');
    fs.writeFileSync(flag, '1');
    fx.git(['add', '-f', '.mempunk/auto-start.flag'], fx.vault);
    fx.git(['commit', '-m', 'flag trackeado por error'], fx.vault);
    expect(fx.git(['ls-files'], fx.vault)).toContain('.mempunk/auto-start.flag');

    fx.run(['remote', 'set', fx.bare]);
    expect(fx.git(['ls-files'], fx.vault)).not.toContain('.mempunk/auto-start.flag');
    expect(fs.existsSync(flag)).toBe(true);
  });
});

// ── A. Historias no relacionadas → pista de bootstrap ────────────────────────

describeGit('pull sobre un vault creado con init en vez de clonar', () => {
  let seed;
  let fx;

  beforeAll(() => {
    seed = createFixture('bootstrap-seed');
    seed.bootstrap();
    seed.run(['remote', 'set', seed.bare, '--branch', 'main']);
    seed.run(['push', '-m', 'vault original']);

    fx = createFixture('bootstrap-new');
    fx.run(['init']);
    fx.run(['remote', 'set', seed.bare, '--branch', 'main']);
  });

  it('pull falla explicando que hay que clonar el vault', () => {
    const r = fx.runRaw(['pull']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('git clone');
    expect(fx.git(['stash', 'list'], fx.vault).trim()).toBe('');
  });
});
