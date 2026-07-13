#!/usr/bin/env node

import { opts, command, subcommand, args } from './lib/args.js';
import { fail } from './lib/output.js';
import { t } from './lib/i18n.js';
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
        default: fail(t('cli.unknownSubcommand', { command: 'project', sub: subcommand ?? '', valid: 'add | list | activate' }));
      }
      break;

    case 'backlog':
      switch (subcommand) {
        case 'add':    cmdBacklogAdd(args[0], args[1]); break;
        case 'list':   cmdBacklogList(args[0]); break;
        case 'update': cmdBacklogUpdate(args[0]); break;
        default: fail(t('cli.unknownSubcommand', { command: 'backlog', sub: subcommand ?? '', valid: 'add | list | update' }));
      }
      break;

    case 'decision':
      switch (subcommand) {
        case 'add':  cmdDecisionAdd(args[0], args[1]); break;
        case 'list': cmdDecisionList(args[0]); break;
        default: fail(t('cli.unknownSubcommand', { command: 'decision', sub: subcommand ?? '', valid: 'add | list' }));
      }
      break;

    case 'skill':
      switch (subcommand) {
        case 'add':    cmdSkillAdd(args[0], args[1]); break;
        case 'list':   cmdSkillList(args[0]); break;
        case 'update': cmdSkillUpdate(args[0]); break;
        default: fail(t('cli.unknownSubcommand', { command: 'skill', sub: subcommand ?? '', valid: 'add | list | update' }));
      }
      break;

    case 'resource':
      switch (subcommand) {
        case 'add':  cmdResourceAdd(args[0], args[1]); break;
        case 'list': cmdResourceList(args[0]); break;
        default: fail(t('cli.unknownSubcommand', { command: 'resource', sub: subcommand ?? '', valid: 'add | list' }));
      }
      break;

    case 'daily':
      switch (subcommand) {
        case 'log':  cmdDailyLog(args[0], args[1]); break;
        case 'list': cmdDailyList(args[0]); break;
        default: fail(t('cli.unknownSubcommand', { command: 'daily', sub: subcommand ?? '', valid: 'log | list' }));
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
        default: fail(t('cli.unknownSubcommand', { command: 'session', sub: subcommand ?? '', valid: 'log | last | recover | checkpoints | save-compact | get-compact | save-checkpoint' }));
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
        default: fail(t('cli.unknownSubcommand', { command: 'vault', sub: subcommand ?? '', valid: 'version | upgrade | backup' }));
      }
      break;

    case 'export':
      cmdExport();
      break;

    case 'hooks':
      switch (subcommand) {
        case 'install':   cmdHooksInstall(); break;
        case 'uninstall': cmdHooksUninstall(); break;
        default: fail(t('cli.unknownSubcommand', { command: 'hooks', sub: subcommand ?? '', valid: 'install | uninstall' }));
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
        default: fail(t('cli.unknownSubcommand', { command: 'cli', sub: subcommand ?? '', valid: 'list' }));
      }
      break;

    case undefined:
      console.log(t('cli.help'));
      break;

    default:
      fail(t('cli.unknownCommand', { command }));
  }
} catch (err) {
  // Capturar errores inesperados de VaultStore o del sistema de archivos
  fail(err.message);
}
})();
