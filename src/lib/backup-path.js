import fs from 'node:fs';
import path from 'node:path';

/**
 * Ruta libre para un backup: `<prefix>-<ISO con ms>.db`, y `_2`, `_3`… si ya existe.
 * VACUUM INTO falla si el destino existe, y dos backups pueden caer en el mismo
 * instante (push y pull seguidos). El sufijo `_n` ordena después de `.db`, así
 * la retención (que poda por nombre) sigue el orden de creación.
 * @param {string} dir - Carpeta de backups (ya creada)
 * @param {string} prefix - Prefijo del archivo, p. ej. 'mempunk'
 * @param {Date} [now]
 * @returns {string}
 */
export function uniqueBackupPath(dir, prefix, now = new Date()) {
  const base = path.join(dir, `${prefix}-${now.toISOString().replace(/[:.]/g, '-')}`);
  let candidate = `${base}.db`;
  for (let n = 2; fs.existsSync(candidate); n += 1) candidate = `${base}_${n}.db`;
  return candidate;
}
