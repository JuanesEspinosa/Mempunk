// ── mempunk mcp — servidor MCP local por stdio ────────────────────────────────
//
// Cada CLI de IA (Claude Code, Gemini, opencode) lo lanza como subproceso al
// abrir la sesión. Expone los servicios de src/services/ como herramientas
// tipadas: una sola implementación, dos interfaces (CLI y MCP).
//
// Reglas (plan v3, 1.5):
// - stdout es solo del protocolo JSON-RPC: todo lo demás va a stderr.
// - Varias sesiones abiertas = varios procesos sobre la misma BD: WAL +
//   busy_timeout en VaultStore. No se cachean lecturas.
// - Vault desactualizado: error de la llamada, nunca migración silenciosa.

import fs from 'node:fs';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { t } from '../lib/i18n.js';
import { CLI_VERSION, VAULT_PATH, openStoreOrThrow, versionProblem } from '../lib/vault.js';
import { resolveProjectId } from '../services/project.js';
import { buildContext, DEFAULT_MAX_CHARS } from '../services/context.js';
import { addDecision } from '../services/decisions.js';
import { logSession } from '../services/sessions.js';
import { addItem, listItems, updateItem, BACKLOG_STATUSES, MIN_PRIORITY, MAX_PRIORITY } from '../services/backlog.js';
import { query, DEFAULT_SEARCH_LIMIT } from '../services/search.js';
import { updateState } from '../services/state.js';

const MIN_CONTEXT_CHARS = 100;
const MAX_SEARCH_LIMIT  = 100;

// ── Esquemas compartidos ──────────────────────────────────────────────────────

const projectId = z.string().optional()
  .describe('Project id. Optional: defaults to the project linked to the current directory.');
const status    = z.enum(BACKLOG_STATUSES);
const priority  = z.number().int().min(MIN_PRIORITY).max(MAX_PRIORITY);

// ── Herramientas ──────────────────────────────────────────────────────────────
// run(store, args) devuelve un string (se envía tal cual) o un objeto (JSON).

const TOOLS = [
  {
    name: 'get_context',
    description: 'mcp.getContext',
    inputSchema: {
      project_id: projectId,
      max_chars:  z.number().int().min(MIN_CONTEXT_CHARS).optional()
        .describe(`Maximum characters of the block (default ${DEFAULT_MAX_CHARS}).`),
    },
    run: (store, args) => buildContext(store, project(store, args), {
      maxChars: args.max_chars ?? DEFAULT_MAX_CHARS,
    }).text,
  },
  {
    name: 'save_decision',
    description: 'mcp.saveDecision',
    inputSchema: {
      project_id:   projectId,
      title:        z.string().describe('Short title of the decision.'),
      context:      z.string().describe('Why a decision was needed: problem and constraints.'),
      decision:     z.string().describe('What was decided and why this option.'),
      consequences: z.string().optional().describe('Accepted trade-offs and follow-ups.'),
      tags:         z.array(z.string()).optional(),
    },
    run: (store, args) => addDecision(store, {
      projectId:    project(store, args),
      title:        args.title,
      context:      args.context,
      decision:     args.decision,
      consequences: args.consequences,
      tags:         args.tags,
    }),
  },
  {
    name: 'log_session',
    description: 'mcp.logSession',
    inputSchema: {
      project_id: projectId,
      summary:    z.string().describe('What was done and what comes next.'),
      files:      z.array(z.string()).optional().describe('Paths of the files touched.'),
    },
    run: (store, args) => logSession(store, { projectId: project(store, args), summary: args.summary, files: args.files }),
  },
  {
    name: 'backlog_list',
    description: 'mcp.backlogList',
    inputSchema: { project_id: projectId, status: status.optional() },
    run: (store, args) => listItems(store, { projectId: project(store, args), status: args.status }),
  },
  {
    name: 'backlog_add',
    description: 'mcp.backlogAdd',
    inputSchema: {
      project_id: projectId,
      title:      z.string().describe('Descriptive title of the task.'),
      priority:   priority.optional(),
    },
    run: (store, args) => addItem(store, { projectId: project(store, args), title: args.title, priority: args.priority }),
  },
  {
    name: 'backlog_update',
    description: 'mcp.backlogUpdate',
    inputSchema: {
      id:       z.string().describe('Task id (bl_…), from backlog_list.'),
      status:   status.optional(),
      priority: priority.optional(),
    },
    run: (store, args) => updateItem(store, { id: args.id, status: args.status, priority: args.priority }),
  },
  {
    name: 'search',
    description: 'mcp.search',
    inputSchema: {
      query:      z.string().describe('Words to search for.'),
      project_id: z.string().optional().describe('Restrict to one project. Optional: searches the whole vault.'),
      limit:      z.number().int().min(1).max(MAX_SEARCH_LIMIT).optional()
        .describe(`Maximum results (default ${DEFAULT_SEARCH_LIMIT}).`),
    },
    // Sin resolución por cwd: buscar en todo el vault es el caso útil por defecto
    run: (store, args) => query(store, { query: args.query, projectId: args.project_id ?? null, limit: args.limit }),
  },
  {
    name: 'update_state',
    description: 'mcp.updateState',
    inputSchema: {
      project_id: projectId,
      markdown:   z.string().describe('Full new state in markdown, without the history section.'),
    },
    run: (store, args) => updateState(store, { projectId: project(store, args), markdown: args.markdown }),
  },
];

function project(store, args) {
  return resolveProjectId(store, { projectId: args.project_id });
}

// ── Store de larga vida ───────────────────────────────────────────────────────

let store = null;

/** Abre la BD en la primera llamada y comprueba la versión en todas: otra
 *  máquina o un `vault upgrade` pueden cambiarla mientras el servidor vive. */
function getStore() {
  if (!fs.existsSync(VAULT_PATH)) throw new Error(t('vault.notInitialized', { path: VAULT_PATH }));
  store ??= openStoreOrThrow();
  const problem = versionProblem(store.getVaultVersion());
  if (problem) throw new Error(problem);
  return store;
}

function closeStore() {
  try { store?.db.close(); } catch (_) { /* ya cerrada */ }
  store = null;
}

// ── Servidor ──────────────────────────────────────────────────────────────────

function toResult(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: 'text', text }] };
}

function runTool(tool) {
  return async (args) => {
    try {
      return toResult(tool.run(getStore(), args ?? {}));
    } catch (err) {
      console.error(`[mempunk mcp] ${tool.name}: ${err.message}`);
      return { isError: true, content: [{ type: 'text', text: err.message }] };
    }
  };
}

export async function cmdMcp() {
  // stdout pertenece al protocolo: cualquier console.log perdido lo corrompería
  console.log  = console.error;
  console.info = console.error;
  console.warn = console.error;

  const server = new McpServer({ name: 'mempunk', version: CLI_VERSION });
  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: t(tool.description), inputSchema: tool.inputSchema }, runTool(tool));
  }

  const shutdown = () => {
    closeStore();
    process.exit(0);
  };
  process.stdin.on('end', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await server.connect(new StdioServerTransport());
}
