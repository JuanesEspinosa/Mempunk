import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { uniqueBackupPath } from '../src/lib/backup-path.js';

const NOW = new Date('2026-10-20T15:04:05.678Z');

let dir;

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mempunk-backup-path-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe('uniqueBackupPath', () => {
  it('usa un sello con milisegundos', () => {
    expect(path.basename(uniqueBackupPath(dir, 'mempunk', NOW)))
      .toBe('mempunk-2026-10-20T15-04-05-678Z.db');
  });

  it('dos backups en el mismo instante no chocan (VACUUM INTO falla si el destino existe)', () => {
    const first = uniqueBackupPath(dir, 'mempunk', NOW);
    fs.writeFileSync(first, '');
    const second = uniqueBackupPath(dir, 'mempunk', NOW);
    fs.writeFileSync(second, '');
    const third = uniqueBackupPath(dir, 'mempunk', NOW);

    expect(new Set([first, second, third]).size).toBe(3);
    expect(fs.existsSync(third)).toBe(false);
  });

  it('el orden lexicográfico sigue el orden de creación (la retención poda por nombre)', () => {
    const names = [];
    for (let i = 0; i < 3; i += 1) {
      const p = uniqueBackupPath(dir, 'mempunk', NOW);
      fs.writeFileSync(p, '');
      names.push(path.basename(p));
    }
    const later = path.basename(uniqueBackupPath(dir, 'mempunk', new Date(NOW.getTime() + 1)));

    expect([...names, later].sort()).toEqual([...names, later]);
  });
});
