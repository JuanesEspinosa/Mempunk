// ── Utilidades de salida ──────────────────────────────────────────────────────

import { t } from './i18n.js';

/** Escribe el error en stderr y termina con código 1 */
export function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

/**
 * Imprime una tabla de texto plano alineada por columnas.
 * @param {string[]}   headers - Nombres de columna
 * @param {unknown[][]} rows   - Filas de datos
 */
export function printTable(headers, rows) {
  if (rows.length === 0) {
    console.log(t('output.noResults'));
    return;
  }

  // Calcular el ancho máximo de cada columna entre header y datos
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );

  const formatRow = (row) =>
    row.map((cell, i) => String(cell ?? '').padEnd(widths[i])).join('  ');

  console.log(formatRow(headers));
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  rows.forEach((row) => console.log(formatRow(row)));
}

/** Salida JSON para consumo por scripts y agentes (flag --json en comandos de lectura) */
export function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}
