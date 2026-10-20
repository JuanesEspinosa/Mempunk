import { opts } from '../lib/args.js';
import { t } from '../lib/i18n.js';
import { fail, printJson } from '../lib/output.js';
import { requireVault, openStore } from '../lib/vault.js';
import { buildContext, DEFAULT_MAX_CHARS } from '../services/context.js';

// Por debajo de esto ni el header ni un título de sección caben con sentido
const MIN_MAX_CHARS = 100;

// ── Handlers — Contexto ───────────────────────────────────────────────────────

export function cmdContext(projectId) {
  if (!projectId) fail(t('usage', { syntax: t('context.usage') }));

  const raw      = opts['max-chars'];
  const maxChars = raw === undefined ? DEFAULT_MAX_CHARS : Number(raw);
  if (!Number.isInteger(maxChars) || maxChars < MIN_MAX_CHARS) {
    fail(t('context.invalidMaxChars', { min: MIN_MAX_CHARS }));
  }

  requireVault();
  const store   = openStore();
  const context = buildContext(store, projectId, { maxChars, withSnapshot: Boolean(opts['with-snapshot']) });

  if (opts.json) return printJson(context);
  console.log(context.text);
}
