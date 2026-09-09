// # mempunk-hook

// Evento: SessionEnd — al cerrar la sesión de Claude Code.
// Si .mempunk/remote.json tiene auto.push_on_end: `mempunk push` con mensaje
// genérico como red de seguridad. El commit "bueno" con resumen lo hace el
// agente mempunk-syncer. SessionEnd ignora stdout — no se escribe nada.

import fs from 'node:fs';
import {
  MEMPUNK_DIR,
  runCli,
  createLogger,
  readStdinJson,
  getProjectId,
  readRemoteConfig,
  hookTimeoutMs,
  classifyCliFailure,
} from '../hooks-lib/common.js';

const AUTO_PUSH_MESSAGE = 'auto-push on session end';

// Tope del push automático: SessionEnd no debe quedarse colgado por un remote caído
const PUSH_TIMEOUT_MS = 60_000;

// Mismo contrato que `mempunk push --project`: solo identificadores simples
const PROJECT_ID_RE = /^[\w.-]+$/;

const MAX_LOGGED_STDERR = 500;

const log = createLogger('on-end');

/** Argumentos --project para el push; vacío (y log) si el id mapeado no es válido */
function projectArgs(projectId) {
  if (!projectId) return [];
  if (PROJECT_ID_RE.test(projectId)) return ['--project', projectId];
  log(`Proyecto ignorado: id inválido para --project: ${JSON.stringify(projectId)}`);
  return [];
}

try {
  fs.mkdirSync(MEMPUNK_DIR, { recursive: true });

  const { cwd, reason } = await readStdinJson();

  const remote = readRemoteConfig();
  if (remote?.auto?.push_on_end) {
    const projectId = getProjectId(cwd);
    const args = ['push', '-m', AUTO_PUSH_MESSAGE, ...projectArgs(projectId)];
    const result = runCli(args, { timeout: hookTimeoutMs(PUSH_TIMEOUT_MS) });

    if (result.status === 0) {
      log(`Push automático OK (reason=${reason ?? 'desconocido'}, proyecto=${projectId ?? 'ninguno'})`);
    } else {
      const kind = classifyCliFailure(result);
      const err  = (result.stderr?.trim() || result.error?.message || 'sin detalle').slice(0, MAX_LOGGED_STDERR);
      log(`Push automático falló (${kind}, status=${result.status ?? 'null'}): ${err}`);
    }
  }
} catch (err) {
  log(`Error inesperado: ${err.message}`);
}

process.exit(0);
