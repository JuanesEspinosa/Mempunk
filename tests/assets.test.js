import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  createAsset, listScopeAssets, parseFrontmatter, resolveProjectAssets, resolveGlobalAssets,
  readProjectProfiles, writeProjectProfiles, listProfiles, scopeRoot, isValidAssetName,
} from '../src/lib/assets.js';
import {
  materialize, MANIFEST_FILE, excludePatterns, replaceExcludeBlock, updateGitExclude,
} from '../src/lib/materialize.js';

let tmp;
let vault;
let claudeDir;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mempunk-assets-'));
  vault = path.join(tmp, 'vault');
  claudeDir = path.join(tmp, 'repo', '.claude');
  fs.mkdirSync(vault, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const skill = (scope, owner, name, description = `desc ${name}`) =>
  createAsset(vault, { kind: 'skill', scope, owner, name, description });
const agent = (scope, owner, name, description = `desc ${name}`) =>
  createAsset(vault, { kind: 'agent', scope, owner, name, description });

// ── assets.js ─────────────────────────────────────────────────────────────────

describe('parseFrontmatter', () => {
  it('lee valores simples, entre comillas y bloques >', () => {
    const fm = parseFrontmatter('---\nname: a\ndescription: "Usa \\"x\\""\nother: >\n  linea uno\n  linea dos\n---\ncuerpo');
    expect(fm).toEqual({ name: 'a', description: 'Usa "x"', other: 'linea uno linea dos' });
  });

  it('sin frontmatter → objeto vacío', () => {
    expect(parseFrontmatter('# solo cuerpo')).toEqual({});
  });
});

describe('createAsset', () => {
  it('crea SKILL.md y agente con frontmatter parseable en cada scope', () => {
    const s = skill('global', null, 'commits');
    const a = agent('project', 'arion', 'mikrotik-expert', 'Experto en: RouterOS "v7"');
    expect(s).toBe(path.join(vault, 'global', 'skills', 'commits', 'SKILL.md'));
    expect(a).toBe(path.join(vault, 'projects', 'arion', 'agents', 'mikrotik-expert.md'));
    expect(parseFrontmatter(fs.readFileSync(a, 'utf8'))).toEqual({
      name: 'mikrotik-expert', description: 'Experto en: RouterOS "v7"',
    });
  });

  it('rechaza nombres inválidos, falta de description y duplicados', () => {
    expect(() => skill('global', null, '../escape')).toThrow(/Nombre inválido/);
    expect(() => skill('global', null, 'Mayus')).toThrow(/Nombre inválido/);
    expect(() => createAsset(vault, { kind: 'skill', scope: 'global', name: 'x', description: '  ' })).toThrow(/description/);
    skill('global', null, 'dup');
    expect(() => skill('global', null, 'dup')).toThrow(/Ya existe/);
  });

  it('valida owner de perfil y de proyecto contra path traversal', () => {
    expect(() => scopeRoot(vault, 'profile', '../x')).toThrow(/perfil inválido/);
    expect(() => scopeRoot(vault, 'project', '..')).toThrow(/proyecto inválido/);
    expect(isValidAssetName('a'.repeat(65))).toBe(false);
  });
});

describe('listScopeAssets', () => {
  it('omite con aviso los assets sin description o con name distinto, y lista skills legacy', () => {
    skill('project', 'p1', 'ok');
    const bad = path.join(vault, 'projects', 'p1', 'skills', 'sin-desc', 'SKILL.md');
    fs.mkdirSync(path.dirname(bad), { recursive: true });
    fs.writeFileSync(bad, '---\nname: sin-desc\n---\n');
    fs.mkdirSync(path.join(vault, 'projects', 'p1', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(vault, 'projects', 'p1', 'agents', 'otro.md'), '---\nname: distinto\ndescription: d\n---\n');
    fs.writeFileSync(path.join(vault, 'projects', 'p1', 'skills', 'viejo.md'), '## legacy');

    const res = listScopeAssets(vault, 'project', 'p1');
    expect(res.assets.map((a) => a.name)).toEqual(['ok']);
    expect(res.warnings.map((w) => w.reason)).toEqual([
      'falta description en el frontmatter',
      'name del frontmatter debe ser "otro"',
    ]);
    expect(res.legacy).toEqual([{ name: 'viejo', path: path.join(vault, 'projects', 'p1', 'skills', 'viejo.md') }]);
  });
});

describe('perfiles y resolución por capas', () => {
  it('perfiles en orden → proyecto; el más específico gana', () => {
    skill('profile', 'nestjs', 'testing', 'nest testing');
    skill('profile', 'nestjs', 'typeorm');
    skill('profile', 'react', 'testing', 'react testing');
    skill('project', 'p1', 'typeorm', 'typeorm del proyecto');
    agent('project', 'p1', 'revisor');
    writeProjectProfiles(vault, 'p1', ['nestjs', 'react', 'nestjs']);

    expect(readProjectProfiles(vault, 'p1')).toEqual(['nestjs', 'react']);
    expect(listProfiles(vault)).toEqual(['nestjs', 'react']);

    const { assets, overrides } = resolveProjectAssets(vault, 'p1');
    const byName = Object.fromEntries(assets.map((a) => [`${a.kind}:${a.name}`, a]));
    expect(byName['skill:testing'].description).toBe('react testing');
    expect(byName['skill:typeorm'].scope).toBe('project');
    expect(byName['agent:revisor'].scope).toBe('project');
    expect(overrides.map((o) => `${o.name}<-${o.overriddenBy}`).sort()).toEqual(['testing<-profile:react', 'typeorm<-project:p1']);
  });

  it('avisa de perfiles inexistentes y no incluye globales en el proyecto', () => {
    skill('global', null, 'g');
    writeProjectProfiles(vault, 'p2', ['fantasma']);
    const res = resolveProjectAssets(vault, 'p2');
    expect(res.assets).toEqual([]);
    expect(res.warnings[0].reason).toMatch(/no existe/);
    expect(resolveGlobalAssets(vault).assets.map((a) => a.name)).toEqual(['g']);
  });

  it('writeProjectProfiles conserva otras claves de mempunk.json', () => {
    const file = path.join(vault, 'projects', 'p3', 'mempunk.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ extra: 1 }));
    writeProjectProfiles(vault, 'p3', ['a']);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual({ extra: 1, profiles: ['a'] });
    expect(() => writeProjectProfiles(vault, 'p3', ['../x'])).toThrow();
  });
});

// ── materialize.js ────────────────────────────────────────────────────────────

const projectAssets = (id) => resolveProjectAssets(vault, id).assets;
const run = (opts = {}) => materialize({ claudeDir, assets: projectAssets('p1'), ...opts });

describe('materialize', () => {
  beforeEach(() => {
    const s = skill('project', 'p1', 'deploy');
    fs.mkdirSync(path.join(path.dirname(s), 'scripts'));
    fs.writeFileSync(path.join(path.dirname(s), 'scripts', 'run.sh'), 'echo hi');
    agent('project', 'p1', 'revisor');
  });

  it('crea archivos y manifiesto; una segunda corrida no cambia nada', () => {
    const first = run();
    expect(first.created.map((p) => path.relative(claudeDir, p).replace(/\\/g, '/')).sort()).toEqual([
      'agents/revisor.md', 'skills/deploy/SKILL.md', 'skills/deploy/scripts/run.sh',
    ]);
    expect(fs.existsSync(path.join(claudeDir, MANIFEST_FILE))).toBe(true);

    const second = run();
    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
    expect(second.unchanged).toBe(3);
  });

  it('actualiza copias sin tocar y borra las que ya no están en el vault', () => {
    run();
    const src = path.join(vault, 'projects', 'p1', 'skills', 'deploy', 'SKILL.md');
    fs.appendFileSync(src, '\nnuevo paso\n');
    fs.rmSync(path.join(vault, 'projects', 'p1', 'agents', 'revisor.md'));

    const res = run();
    expect(res.updated).toEqual([path.join(claudeDir, 'skills', 'deploy', 'SKILL.md')]);
    expect(res.removed).toEqual([path.join(claudeDir, 'agents', 'revisor.md')]);
    expect(fs.readFileSync(path.join(claudeDir, 'skills', 'deploy', 'SKILL.md'), 'utf8')).toContain('nuevo paso');
    expect(fs.existsSync(path.join(claudeDir, 'agents'))).toBe(false);
  });

  it('nunca pisa una copia editada a mano: conflicto y asset omitido', () => {
    run();
    const copy = path.join(claudeDir, 'skills', 'deploy', 'SKILL.md');
    fs.writeFileSync(copy, 'editado a mano');
    fs.appendFileSync(path.join(vault, 'projects', 'p1', 'skills', 'deploy', 'scripts', 'run.sh'), '\necho 2');

    const res = run();
    expect(res.conflicts).toEqual([expect.objectContaining({ asset: 'skill:deploy', path: copy, reason: 'modificado localmente' })]);
    expect(fs.readFileSync(copy, 'utf8')).toBe('editado a mano');
    // Asset entero omitido: el script tampoco se actualizó a medias
    expect(fs.readFileSync(path.join(claudeDir, 'skills', 'deploy', 'scripts', 'run.sh'), 'utf8')).toBe('echo hi');
  });

  it('no pisa archivos propios del usuario con el mismo nombre', () => {
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'revisor.md'), 'mío');
    const res = run();
    expect(res.conflicts.map((c) => c.reason)).toEqual(['archivo no gestionado por mempunk']);
    expect(fs.readFileSync(path.join(claudeDir, 'agents', 'revisor.md'), 'utf8')).toBe('mío');
  });

  it('no borra una copia editada aunque el asset se elimine del vault', () => {
    run();
    const copy = path.join(claudeDir, 'agents', 'revisor.md');
    fs.writeFileSync(copy, 'mi versión');
    fs.rmSync(path.join(vault, 'projects', 'p1', 'agents', 'revisor.md'));
    const res = run();
    expect(res.removed).toEqual([]);
    expect(fs.existsSync(copy)).toBe(true);
    expect(res.conflicts[0].reason).toMatch(/se conserva/);
  });

  it('--dry-run informa sin escribir nada', () => {
    const res = run({ dryRun: true });
    expect(res.created).toHaveLength(3);
    expect(fs.existsSync(claudeDir)).toBe(false);
  });

  it('sin assets ni manifiesto no crea .claude/', () => {
    const res = materialize({ claudeDir, assets: [] });
    expect(res.managed).toEqual([]);
    expect(fs.existsSync(claudeDir)).toBe(false);
  });
});

describe('git exclude', () => {
  it('excludePatterns agrupa skills por carpeta e incluye el manifiesto', () => {
    expect(excludePatterns(['skills/a/SKILL.md', 'skills/a/x.sh', 'agents/b.md'])).toEqual([
      '/.claude/.mempunk-managed.json', '/.claude/agents/b.md', '/.claude/skills/a/',
    ]);
    expect(excludePatterns([])).toEqual([]);
  });

  it('replaceExcludeBlock conserva líneas del usuario y es idempotente', () => {
    const once = replaceExcludeBlock('*.log\n', ['/.claude/x']);
    expect(replaceExcludeBlock(once, ['/.claude/x'])).toBe(once);
    expect(once.startsWith('*.log\n')).toBe(true);
    expect(replaceExcludeBlock(once, [])).toBe('*.log\n');
  });

  it('updateGitExclude escribe en .git/info/exclude y no hace nada fuera de git', () => {
    const repo = path.dirname(claudeDir);
    fs.mkdirSync(repo, { recursive: true });
    expect(updateGitExclude(repo, ['agents/a.md'])).toBe(false);

    spawnSync('git', ['init', '-q'], { cwd: repo });
    expect(updateGitExclude(repo, ['agents/a.md'])).toBe(true);
    expect(fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8')).toContain('/.claude/agents/a.md');
    expect(updateGitExclude(repo, ['agents/a.md'])).toBe(false);

    // El archivo excluido no aparece en git status
    fs.mkdirSync(path.join(claudeDir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'agents', 'a.md'), 'x');
    const status = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: repo, encoding: 'utf8' }).stdout;
    expect(status).not.toContain('a.md');
  });
});

// ── Regresiones de la revisión de código ─────────────────────────────────────

describe('materialize — casos borde', () => {
  beforeEach(() => {
    agent('project', 'p1', 'revisor');
  });

  it('no adopta un archivo del usuario idéntico: si el asset se borra, el archivo sobrevive', () => {
    const copy = path.join(claudeDir, 'agents', 'revisor.md');
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.copyFileSync(path.join(vault, 'projects', 'p1', 'agents', 'revisor.md'), copy);

    const first = run();
    expect(first.managed).toEqual([]);
    fs.rmSync(path.join(vault, 'projects', 'p1', 'agents', 'revisor.md'));
    run();
    expect(fs.existsSync(copy)).toBe(true);
  });

  it('conserva la copia instalada de un asset que quedó inválido en el vault', () => {
    run();
    const src = path.join(vault, 'projects', 'p1', 'agents', 'revisor.md');
    fs.writeFileSync(src, '---\nname: revisor\n---\nsin description');
    const resolved = resolveProjectAssets(vault, 'p1');
    expect(resolved.invalid).toEqual([{ kind: 'agent', name: 'revisor' }]);

    const res = materialize({ claudeDir, assets: resolved.assets, keep: resolved.invalid });
    expect(res.removed).toEqual([]);
    expect(res.managed).toEqual(['agents/revisor.md']);
    expect(fs.existsSync(path.join(claudeDir, 'agents', 'revisor.md'))).toBe(true);
  });

  it('un manifiesto manipulado no puede borrar archivos fuera de skills/ y agents/', () => {
    fs.mkdirSync(claudeDir, { recursive: true });
    const settings = path.join(claudeDir, 'settings.json');
    fs.writeFileSync(settings, '{}');
    const hash = crypto.createHash('sha256').update('{}').digest('hex');
    fs.writeFileSync(path.join(claudeDir, MANIFEST_FILE), JSON.stringify({ files: { 'settings.json': hash, 'agents/../../x.md': hash } }));

    const res = run();
    expect(fs.existsSync(settings)).toBe(true);
    expect(res.warnings.filter((w) => /ignorada/.test(w.reason))).toHaveLength(2);
  });

  it('no escribe a través de un symlink dentro de .claude/', () => {
    const outside = path.join(tmp, 'fuera');
    fs.mkdirSync(outside, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    try {
      fs.symlinkSync(outside, path.join(claudeDir, 'agents'), 'junction');
    } catch (_) {
      return; // sin permiso para crear links en este sistema: nada que probar
    }
    const res = run();
    expect(res.conflicts[0].reason).toMatch(/symlink/);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('un error en un asset no aborta los demás y el manifiesto se escribe', () => {
    skill('project', 'p1', 'ok-skill');
    const badAsset = { kind: 'skill', name: 'roto', scope: 'project', owner: 'p1', source: path.join(tmp, 'no-existe'), entry: 'x' };
    const res = materialize({ claudeDir, assets: [badAsset, ...projectAssets('p1')] });
    expect(res.conflicts[0].reason).toMatch(/^error:/);
    expect(res.managed).toEqual(expect.arrayContaining(['agents/revisor.md', 'skills/ok-skill/SKILL.md']));
    expect(fs.existsSync(path.join(claudeDir, MANIFEST_FILE))).toBe(true);
  });

  it('rechaza nombres reservados de Windows', () => {
    expect(isValidAssetName('con')).toBe(false);
    expect(isValidAssetName('lpt1')).toBe(false);
    expect(isValidAssetName('console')).toBe(true);
  });
});

describe('git exclude — monorepo y bloque roto', () => {
  it('un bloque sin cierre no se toca (null) y las líneas del usuario no se pierden', () => {
    expect(replaceExcludeBlock('# >>> mempunk (managed — do not edit) [/] >>>\n/x\nmis-lineas\n', ['/y'])).toBeNull();
  });

  it('root en subdirectorio: patrones con prefijo y un bloque por root', () => {
    const repo = path.join(tmp, 'mono');
    const api = path.join(repo, 'apps', 'api');
    const web = path.join(repo, 'apps', 'web');
    fs.mkdirSync(api, { recursive: true });
    fs.mkdirSync(web, { recursive: true });
    spawnSync('git', ['init', '-q'], { cwd: repo });

    expect(updateGitExclude(api, ['agents/a.md'])).toBe(true);
    expect(updateGitExclude(web, ['agents/b.md'])).toBe(true);
    const exclude = fs.readFileSync(path.join(repo, '.git', 'info', 'exclude'), 'utf8');
    expect(exclude).toContain('/apps/api/.claude/agents/a.md');
    expect(exclude).toContain('/apps/web/.claude/agents/b.md');

    fs.mkdirSync(path.join(api, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(path.join(api, '.claude', 'agents', 'a.md'), 'x');
    const status = spawnSync('git', ['status', '--porcelain', '-uall'], { cwd: repo, encoding: 'utf8' }).stdout;
    expect(status).not.toContain('a.md');
  });
});
