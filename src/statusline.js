#!/usr/bin/env node
// # mempunk-statusline

// Script de statusline para Claude Code.
// Recibe stdin JSON con datos del contexto y muestra una barra de progreso con color.
//
// Instalación: mempunk hooks install (añade este script a ~/.claude/settings.json)

import fs from 'node:fs';

// ── Leer stdin ────────────────────────────────────────────────────────────────

let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;

let data = {};
try { data = JSON.parse(input || '{}'); } catch (_) {}

// ── Extraer campos ────────────────────────────────────────────────────────────

const ctxWindow  = data.context_window ?? {};
const pct        = ctxWindow.used_percentage ?? null;
const model      = data.model?.display_name ?? data.model?.id ?? null;
const costUsd    = data.cost?.total_cost_usd ?? null;

// Si no hay datos de contexto todavía, mostrar placeholder
if (pct === null) {
  const parts = ['ctx: --'];
  if (model)   parts.push(model);
  if (costUsd != null) parts.push(`$${costUsd.toFixed(3)}`);
  process.stdout.write(parts.join(' | '));
  process.exit(0);
}

// ── Calcular color y emoji ────────────────────────────────────────────────────

let emoji;
if (pct >= 84)      emoji = '🚨';
else if (pct >= 80) emoji = '🔶';
else if (pct >= 70) emoji = '⚠️ ';
else                emoji = '🟢';

// ── Barra de progreso ASCII (10 chars) ────────────────────────────────────────

const filled = Math.min(10, Math.round(pct / 10));
const bar    = '█'.repeat(filled) + '░'.repeat(10 - filled);

// ── Construir línea de salida ─────────────────────────────────────────────────

const parts = [`${emoji} ${bar} ${pct}%`];
if (model)         parts.push(model);
if (costUsd != null) parts.push(`$${costUsd.toFixed(3)}`);

process.stdout.write(parts.join(' | '));
