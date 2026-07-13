#!/usr/bin/env node

import { opts, command, subcommand, args } from './lib/args.js';
import { fail } from './lib/output.js';
import { CLI_VERSION } from './lib/vault.js';
import { cmdInit } from './commands/init.js';
import { cmdProjectAdd, cmdProjectList, cmdProjectActivate } from './commands/project.js';
import { cmdBacklogAdd, cmdBacklogList, cmdBacklogUpdate } from './commands/backlog.js';
import { cmdDecisionAdd, cmdDecisionList } from './commands/decision.js';
import { cmdSkillAdd, cmdSkillList, cmdSkillUpdate } from './commands/skill.js';
import { cmdResourceAdd, cmdResourceList } from './commands/resource.js';
import { cmdDailyLog, cmdDailyList } from './commands/daily.js';
import {
  cmdSessionLog, cmdSessionLast, cmdSessionRecover, cmdSessionCheckpoints,
  cmdSessionSaveCheckpoint, cmdSessionGetCompact, cmdSessionSaveCompact,
} from './commands/session.js';
import { cmdSearch } from './commands/search.js';
import { cmdSync } from './commands/sync.js';
import { cmdVaultVersion, cmdVaultUpgrade, cmdVaultBackup, cmdExport } from './commands/vault.js';
import { cmdHooksInstall, cmdHooksUninstall, cmdAutoStart } from './commands/hooks.js';
import { cmdSetup } from './commands/setup.js';
import { cmdLink, cmdUnlink, cmdCliList } from './commands/link.js';
import { cmdStatus } from './commands/status.js';
import { cmdRemove } from './commands/remove.js';
import { cmdDoctor } from './commands/doctor.js';
import { cmdOpenLog } from './commands/log.js';

// ── Router principal ──────────────────────────────────────────────────────────

(async () => {
try {
  if (opts.v || opts.version) {
    console.log(`mempunk v${CLI_VERSION}`);
    process.exit(0);
  }

  switch (command) {
    case 'init':
      cmdInit();
      break;

    case 'project':
      switch (subcommand) {
        case 'add':      cmdProjectAdd(args[0], args[1]); break;
        case 'list':     cmdProjectList(); break;
        case 'activate': cmdProjectActivate(args[0]); break;
        default: fail(`Subcomando desconocido: project ${subcommand ?? ''}. Usa: add | list | activate`);
      }
      break;

    case 'backlog':
      switch (subcommand) {
        case 'add':    cmdBacklogAdd(args[0], args[1]); break;
        case 'list':   cmdBacklogList(args[0]); break;
        case 'update': cmdBacklogUpdate(args[0]); break;
        default: fail(`Subcomando desconocido: backlog ${subcommand ?? ''}. Usa: add | list | update`);
      }
      break;

    case 'decision':
      switch (subcommand) {
        case 'add':  cmdDecisionAdd(args[0], args[1]); break;
        case 'list': cmdDecisionList(args[0]); break;
        default: fail(`Subcomando desconocido: decision ${subcommand ?? ''}. Usa: add | list`);
      }
      break;

    case 'skill':
      switch (subcommand) {
        case 'add':    cmdSkillAdd(args[0], args[1]); break;
        case 'list':   cmdSkillList(args[0]); break;
        case 'update': cmdSkillUpdate(args[0]); break;
        default: fail(`Subcomando desconocido: skill ${subcommand ?? ''}. Usa: add | list | update`);
      }
      break;

    case 'resource':
      switch (subcommand) {
        case 'add':  cmdResourceAdd(args[0], args[1]); break;
        case 'list': cmdResourceList(args[0]); break;
        default: fail(`Subcomando desconocido: resource ${subcommand ?? ''}. Usa: add | list`);
      }
      break;

    case 'daily':
      switch (subcommand) {
        case 'log':  cmdDailyLog(args[0], args[1]); break;
        case 'list': cmdDailyList(args[0]); break;
        default: fail(`Subcomando desconocido: daily ${subcommand ?? ''}. Usa: log | list`);
      }
      break;

    case 'session':
      switch (subcommand) {
        case 'log':             cmdSessionLog(args[0], args[1]); break;
        case 'last':            cmdSessionLast(args[0]); break;
        case 'recover':         cmdSessionRecover(args[0]); break;
        case 'checkpoints':     cmdSessionCheckpoints(args[0]); break;
        case 'save-compact':    cmdSessionSaveCompact(args[0]); break;
        case 'get-compact':     cmdSessionGetCompact(args[0]); break;
        case 'save-checkpoint': cmdSessionSaveCheckpoint(args[0]); break;
        default: fail(`Subcomando desconocido: session ${subcommand ?? ''}. Usa: log | last | recover | checkpoints | save-compact | get-compact | save-checkpoint`);
      }
      break;

    // search no tiene subcomando — la query ocupa positionals[1]
    case 'search':
      cmdSearch(subcommand);
      break;

    case 'sync':
      cmdSync();
      break;

    case 'vault':
      switch (subcommand) {
        case 'version': cmdVaultVersion(); break;
        case 'upgrade': cmdVaultUpgrade(); break;
        case 'backup':  cmdVaultBackup(); break;
        default: fail(`Subcomando desconocido: vault ${subcommand ?? ''}. Usa: version | upgrade | backup`);
      }
      break;

    case 'export':
      cmdExport();
      break;

    case 'hooks':
      switch (subcommand) {
        case 'install':   cmdHooksInstall(); break;
        case 'uninstall': cmdHooksUninstall(); break;
        default: fail(`Subcomando desconocido: hooks ${subcommand ?? ''}. Usa: install | uninstall`);
      }
      break;

    case 'setup':
      await cmdSetup();
      break;

    case 'link':
      cmdLink();
      break;

    case 'unlink':
      cmdUnlink();
      break;

    case 'status':
      cmdStatus();
      break;

    case 'remove':
      cmdRemove(subcommand);
      break;

    case 'doctor':
      cmdDoctor();
      break;

    case 'auto-start':
      cmdAutoStart(subcommand);
      break;

    case 'log':
      cmdOpenLog(subcommand);
      break;

    case 'cli':
      switch (subcommand) {
        case 'list': cmdCliList(); break;
        default: fail(`Subcomando desconocido: cli ${subcommand ?? ''}. Usa: list`);
      }
      break;

    case undefined:
      console.log('Uso: mempunk <comando> [opciones]');
      console.log('');
      console.log('Setup:');
      console.log('  setup                             Inicializa, vincula y configura hooks (todo en uno)');
      console.log('  init                              Inicializa el vault en ~/Dev-Brain');
      console.log('  link       [--cli claude|gemini|opencode]  Vincula el vault (default: todos los instalados)');
      console.log('  unlink     [--cli claude|gemini|opencode]  Desvincula el vault');
      console.log('  status                            Dashboard: vault, proyectos y sesiones');
      console.log('  doctor                            Verifica integridad del vault');
      console.log('  auto-start on|off                 Activa/desactiva auto-start al iniciar sesión');
      console.log('  cli      list                     Muestra CLIs vinculados al vault');
      console.log('  -v                                Muestra la versión del CLI');
      console.log('');
      console.log('Proyectos:');
      console.log('  project  add <id> <name>          Crea un proyecto');
      console.log('  project  list                     Lista proyectos activos');
      console.log('  remove   <id> --yes               Elimina un proyecto (irreversible)');
      console.log('  log      <id>                     Abre el INDEX.md del proyecto en el editor');
      console.log('');
      console.log('Backlog:');
      console.log('  backlog  add <proj> "<title>"     Agrega tarea al backlog');
      console.log('  backlog  list <proj>              Lista tareas del backlog');
      console.log('  backlog  update <id>              Actualiza una tarea');
      console.log('');
      console.log('Conocimiento:');
      console.log('  decision add <proj> "<title>"     Crea una decisión (ADR)');
      console.log('  decision list <proj>              Lista decisiones del proyecto');
      console.log('  skill    add <proj> <name>        Crea un skill de proyecto');
      console.log('  skill    list <proj>              Lista skills del proyecto');
      console.log('  skill    update <id>              Actualiza contenido de un skill');
      console.log('  resource add <proj> "<title>"     Captura un resource externo');
      console.log('  resource list <proj>              Lista resources del proyecto');
      console.log('');
      console.log('Sesiones y logs:');
      console.log('  session  log <proj> "<summary>"   Registra sesión de trabajo');
      console.log('  session  last <proj>              Muestra la última sesión');
      console.log('  daily    log <proj> "<content>"   Agrega una entrada al log diario');
      console.log('  daily    list <proj>              Lista los logs diarios del proyecto');
      console.log('  search   "<query>"                Búsqueda full-text en el vault');
      console.log('');
      console.log('Mantenimiento:');
      console.log('  sync                              Verifica consistencia vault ↔ BD');
      console.log('  vault    version                  Muestra la versión del vault y del CLI');
      console.log('  vault    upgrade                  Actualiza el vault a la versión más reciente');
      console.log('  hooks    install                  Instala hooks globalmente en ~/.claude/hooks/');
      console.log('  hooks    install --local          Instala hooks en .claude/hooks/ del proyecto actual');
      console.log('  hooks    install --check          Verifica si los hooks están activos');
      console.log('  hooks    uninstall                Elimina hooks de Mempunk (global por defecto)');
      break;

    default:
      fail(`Comando desconocido: "${command}". Ejecuta "mempunk" sin argumentos para ver ayuda.`);
  }
} catch (err) {
  // Capturar errores inesperados de VaultStore o del sistema de archivos
  fail(err.message);
}
})();
