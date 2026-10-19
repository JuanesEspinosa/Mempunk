import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { installVaultSkills } from '../src/commands/setup.js';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');

// ── npm pack ──────────────────────────────────────────────────────────────────

describe('paquete npm', () => {
  let files;

  beforeAll(() => {
    // --ignore-scripts: dist/ ya lo generó pretest; prepack ensuciaría el JSON
    const out = execSync('npm pack --dry-run --json --ignore-scripts', {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    files = JSON.parse(out)[0].files.map((f) => f.path.replace(/\\/g, '/'));
  }, 60_000);

  it.each([
    ['vault-skills/', /^vault-skills\/[^/]+\.md$/],
    ['src/agents/',   /^src\/agents\/[^/]+\.md$/],
    ['dist/hooks/',   /^dist\/hooks\/[^/]+\.js$/],
    ['templates/',    /^templates\//],
  ])('incluye %s', (_label, pattern) => {
    expect(files.some((p) => pattern.test(p))).toBe(true);
  });

  it('incluye todos los vault-skills del repo', () => {
    const expected = fs.readdirSync(path.join(PROJECT_ROOT, 'vault-skills'))
      .filter((f) => f.endsWith('.md'))
      .map((f) => `vault-skills/${f}`);
    expect(expected.length).toBeGreaterThan(0);
    for (const file of expected) expect(files).toContain(file);
  });
});

// ── installVaultSkills ────────────────────────────────────────────────────────

describe('installVaultSkills', () => {
  const TMP = path.join(os.tmpdir(), `mempunk-vault-skills-${Date.now()}`);

  beforeAll(() => fs.mkdirSync(TMP, { recursive: true }));
  afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

  it('copia solo los .md al destino', () => {
    const src  = path.join(TMP, 'src-ok');
    const dest = path.join(TMP, 'dest-ok');
    fs.mkdirSync(src);
    fs.writeFileSync(path.join(src, 'a.md'), '# a');
    fs.writeFileSync(path.join(src, 'b.txt'), 'b');

    installVaultSkills(src, dest);

    expect(fs.readdirSync(dest)).toEqual(['a.md']);
  });

  it('lanza error con la ruta si falta el directorio de origen', () => {
    const missing = path.join(TMP, 'no-existe');
    const dest    = path.join(TMP, 'dest-missing');

    expect(() => installVaultSkills(missing, dest)).toThrow(missing);
    expect(fs.existsSync(dest)).toBe(false);
  });
});
