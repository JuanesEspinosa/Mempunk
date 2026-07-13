// ── i18n — catálogo de mensajes del CLI ───────────────────────────────────────
//
// Inglés por defecto; español via MEMPUNK_LANG=es (cualquier valor que empiece
// con "es"). El idioma se resuelve UNA vez a nivel de módulo.
//
// t(key, params) interpola placeholders {name} en el template. Si la clave
// falta en el idioma activo cae al inglés; si falta en ambos devuelve la clave
// tal cual — nunca lanza.

const MESSAGES = {
  en: {
    // Genéricos
    'usage': 'Usage: {syntax}',
    'usage.internal': 'Internal usage: {syntax}',

    // Router (cli.js)
    'cli.unknownSubcommand': 'Unknown subcommand: {command} {sub}. Use: {valid}',
    'cli.unknownCommand': 'Unknown command: "{command}". Run "mempunk" with no arguments to see help.',
    'cli.help': `Usage: mempunk <command> [options]

Setup:
  setup                             Initialize, link and configure hooks (all in one)
  init                              Initialize the vault at ~/Dev-Brain
  link       [--cli claude|gemini|opencode]  Link the vault (default: all installed)
  unlink     [--cli claude|gemini|opencode]  Unlink the vault
  status                            Dashboard: vault, projects and sessions
  doctor                            Check vault integrity
  auto-start on|off                 Enable/disable auto-start on session start
  cli      list                     Show CLIs linked to the vault
  -v                                Show the CLI version

Projects:
  project  add <id> <name>          Create a project
  project  list                     List active projects
  remove   <id> --yes               Delete a project (irreversible)
  log      <id>                     Open the project's INDEX.md in the editor

Backlog:
  backlog  add <proj> "<title>"     Add a task to the backlog
  backlog  list <proj>              List backlog tasks
  backlog  update <id>              Update a task

Knowledge:
  decision add <proj> "<title>"     Create a decision (ADR)
  decision list <proj>              List project decisions
  skill    add <proj> <name>        Create a project skill
  skill    list <proj>              List project skills
  skill    update <id>              Update a skill's content
  resource add <proj> "<title>"     Capture an external resource
  resource list <proj>              List project resources

Sessions and logs:
  session  log <proj> "<summary>"   Log a work session
  session  last <proj>              Show the last session
  daily    log <proj> "<content>"   Add an entry to the daily log
  daily    list <proj>              List the project's daily logs
  search   "<query>"                Full-text search across the vault

Maintenance:
  sync                              Check vault ↔ database consistency
  vault    version                  Show the vault and CLI versions
  vault    upgrade                  Upgrade the vault to the latest version
  hooks    install                  Install hooks globally in ~/.claude/hooks/
  hooks    install --local          Install hooks in the current project's .claude/hooks/
  hooks    install --check          Check whether the hooks are active
  hooks    uninstall                Remove Mempunk hooks (global by default)`,

    // output.js
    'output.noResults': '(no results)',

    // lib/vault.js
    'vault.notInitialized': 'Vault not found at {path}. Run "mempunk init" first.',
    'vault.outdated': 'Vault out of date (v{current} → v{required}). Run mempunk vault upgrade.',

    // lib/config-files.js
    'config.parseError': 'Could not parse {path}: {message}\nFix the JSON manually and try again.',

    // lib/cli-defs.js
    'cli.unknownCli': 'Unknown CLI: "{flag}". Options: claude, gemini, opencode',

    // init
    'init.done': 'Vault initialized at {path}',

    // project
    'project.pathNotFound': 'The directory given in --path does not exist: {path}',
    'project.created': 'Project "{name}" created at {path}',
    'project.dirMapped': 'Directory mapped: {root} → {id}',
    'project.active': 'Active project: {id}',
    'project.notFoundHint': 'Project not found: "{id}". Run mempunk project list to see the available ones.',
    'project.notFound': 'Project not found: {id}',

    // backlog
    'backlog.added': 'Task added with id {id}',
    'backlog.updateNoFields': 'Specify at least --status or --priority to update',
    'backlog.updated': 'Task {id} updated',

    // decision
    'decision.saved': 'Decision saved to {path}',

    // skill
    'skill.created': 'Skill {name} created at {path}',
    'skill.fileNotFound': 'File not found: {path}',
    'skill.updated': 'Skill {id} updated',

    // resource
    'resource.saved': 'Resource saved to {path}',

    // daily
    'daily.appended': 'Entry appended to {path}',
    'daily.created': 'Log created at {path}',

    // session
    'session.logged': 'Session logged for {id}',
    'session.none': 'No sessions logged for project "{id}"',
    'session.noSnapshots': 'No snapshots saved for project "{id}"',
    'session.checkpointHint': 'Checkpoints are saved automatically every 5 turns (on-stop hook).',
    'session.compactHint': 'Compact snapshots are saved before each compaction (on-compact hook).',
    'session.lastSnapshot': 'Last available snapshot: {date} ({type})',
    'session.snapshotMeta': 'Session ID: {sessionId} | Messages: {count}',
    'session.filesTouched': 'Files touched:',
    'session.commandsRun': 'Commands run:',
    'session.lastMessages': 'Last messages:',
    'session.seeCheckpoints': 'To see full checkpoints: mempunk session checkpoints {id}',
    'session.unknownDate': 'unknown',
    'session.noCheckpoints': 'No checkpoints for project "{id}"',
    'session.checkpointsHeader': 'Checkpoints for {id} (most recent first):',
    'session.colDate': 'Date',
    'session.colType': 'Type',
    'session.colDetail': 'Detail',
    'session.colFiles': 'Files',
    'session.turnLabel': 'turn {n}',
    'session.tmpReadError': 'Could not read the temporary file: {message}',
    'session.tmpIncomplete': 'Incomplete data in the temporary file',

    // search
    'search.noResults': 'No results',

    // sync
    'sync.ok': 'Vault is in sync',
    'sync.missingFiles': 'Records with no file on disk:',
    'sync.unregistered': 'Files not registered in the database:',
    'sync.missingScaffold': 'Missing scaffold files:',
    'sync.colFile': 'file',

    // vault (comandos)
    'vault.upgradeHint': '⚠ Your vault is on v{version}. Run mempunk vault upgrade to update it.',
    'vault.ok': 'Vault v{version} — OK',
    'vault.alreadyLatest': 'The vault is already on the latest version (v{version})',
    'vault.upgraded': 'Vault upgraded to v{version} ({count} migration(s) applied)',
    'vault.backupIntegrityFailed': 'The backup failed the integrity check: {result}',
    'vault.backupCreated': 'Backup created: {path} (integrity ✓)',
    'export.created': 'Export created: {path} ({tables} tables, {rows} rows)',

    // hooks (comandos)
    'hooks.bundleMissing': 'Bundled hook not found: {path} — run npm run build',
    'hooks.checkHooksHeader': 'Hooks ({dir}):',
    'hooks.checkSettingsHeader': 'Registered in settings.json ({path}):',
    'hooks.checkAgentsHeader': 'Agents ({dir}):',
    'hooks.statuslineConfigured': 'Statusline configured in {path}',
    'hooks.statuslineUnchanged': 'Statusline already configured — settings.json not modified',
    'hooks.agentsInstalled': 'Agents installed in {dir}',
    'hooks.installed': 'Hooks installed in {dir}',
    'hooks.removed': 'Hooks removed from {dir}',
    'hooks.noneFound': 'No Mempunk hooks found in {dir}',
    'hooks.agentsRemoved': 'Agents removed from {dir}',
    'hooks.statuslineUnregistered': 'Statusline unregistered from settings.json',

    // auto-start
    'autostart.status': 'Auto-start: {state}',
    'autostart.alreadyOn': 'Auto-start was already enabled',
    'autostart.requiresHooks': '! Auto-start requires the hooks to be installed.\n  Run first: mempunk hooks install\n',
    'autostart.enabled': 'Auto-start enabled',
    'autostart.alreadyOff': 'Auto-start was already disabled',
    'autostart.disabled': 'Auto-start disabled',
    'autostart.unknownAction': 'Unknown action: "{action}". Use: on | off',

    // link / unlink / cli list
    'link.linked': 'Vault linked to {name}: {path}',
    'link.alreadyLinked': 'Vault already linked to {name}',
    'link.restart': 'Restart your CLIs to apply the change.',
    'link.unlinked': 'Vault unlinked from {name}',
    'link.notLinked': 'Vault was not linked to {name}',
    'cliList.header': 'CLIs compatible with Mempunk:',
    'cliList.notInstalled': '(not installed)',
    'cliList.linked': '(linked)',
    'cliList.notLinkedHint': '(not linked — mempunk link --cli {flag})',

    // log (abrir en editor)
    'log.dirNotFound': 'Directory not found: {dir}',
    'log.opened': 'Opened: {target}',

    // remove
    'remove.confirm': 'Destructive operation. Confirm with: mempunk remove {id} --yes',
    'remove.done': 'Project "{id}" removed',

    // status
    'status.linked': 'linked',
    'status.notLinked': 'not linked (mempunk link --cli {flag})',
    'status.projects': 'Projects: {count}',
    'status.none': '(no projects registered)',
    'status.backlogLine': 'backlog: {pending} pending / {inProgress} in progress  |  last session: {date}',

    // doctor
    'doctor.dbFound': 'Database found',
    'doctor.dbMissing': 'Database not found — run mempunk init',
    'doctor.outdated': 'Vault out of date (v{current} → v{required}) — run mempunk vault upgrade',
    'doctor.upToDate': 'Vault v{version} — up to date',
    'doctor.projectCount': '{count} project(s) in the database',
    'doctor.dirMissing': 'Project "{id}": directory not found on disk',
    'doctor.missingDecisions': 'Project "{id}": missing decisions/',
    'doctor.missingSkills': 'Project "{id}": missing skills/',
    'doctor.linked': 'Vault linked to {name}',
    'doctor.notLinked': 'Vault not linked to {name} — run mempunk link --cli {flag}',
    'doctor.hooksInstalled': 'Hooks installed ({scope})',
    'doctor.hooksMissing': 'Hooks not installed — run mempunk hooks install',
    'doctor.agentsInstalled': 'Agents installed ({scope})',
    'doctor.agentsMissing': 'Agents not installed — run mempunk hooks install',
    'doctor.logErrors': 'hooks.log contains {count} recent error(s) — check: {path}',
    'doctor.logOk': 'hooks.log has no recent errors',
    'doctor.activeInvalid': 'active-project.json exists but is not valid JSON — run mempunk project activate <id>',
    'doctor.noActive': 'No active project — hooks cannot save checkpoints\n    Fix:      mempunk project activate <id>\n    Example:  mempunk project activate {example}',
    'doctor.allGood': 'All good',
    'doctor.errorCount': '{count} error(s)',
    'doctor.warningCount': '{count} warning(s)',

    // setup
    'setup.vaultCreated': '✓ Vault created at {path}',
    'setup.vaultExists': '✓ Existing vault at {path}',
    'setup.askCli': '\nWhich AI CLI do you mainly use?',
    'setup.cliOption1': '  1. Claude Code',
    'setup.cliOption2': '  2. Gemini CLI / opencode / other\n',
    'setup.choose': 'Choose (1 or 2): ',
    'setup.askMode': '\nHow do you want Mempunk to work?',
    'setup.modeOption1': '  1. Automatic — hooks + agents  (recommended)',
    'setup.modeOption1a': '     Hooks save checkpoints on their own and @mempunk-loader',
    'setup.modeOption1b': '     loads the context at the start of each session.',
    'setup.modeOption2': '  2. Manual — vault-skills only',
    'setup.modeOption2a': '     You run the protocols yourself at session start/end.\n',
    'setup.invalidMode': 'Invalid --setup-mode: "{mode}". Use: auto | manual | vault-skills',
    'setup.linked': '✓ Vault linked to {name}',
    'setup.alreadyLinked': '✓ Vault already linked to {name}',
    'setup.noCliDetected': '! Neither Gemini CLI nor opencode was detected. Link manually with:',
    'setup.noCliDetectedHint': '    mempunk link --cli gemini   (or opencode)',
    'setup.vaultSkills': '✓ vault-skills installed in {path}',
    'setup.nextStep': 'Next step:',
    'setup.nextStepCmd': '  mempunk project add <id> "<project name>"',
    'setup.autoHint': '\nWhen Claude Code starts: @mempunk-loader runs automatically.',
    'setup.manualHint': '\nTo load context at session start:',
    'setup.manualHintRead': '  Read {path}',
    'setup.migrateHint': '\nIf you migrate to Claude Code in the future:',
    'setup.migrateHintCmd': '  mempunk setup --setup-mode auto',
  },

  es: {
    // Genéricos
    'usage': 'Uso: {syntax}',
    'usage.internal': 'Uso interno: {syntax}',

    // Router (cli.js)
    'cli.unknownSubcommand': 'Subcomando desconocido: {command} {sub}. Usa: {valid}',
    'cli.unknownCommand': 'Comando desconocido: "{command}". Ejecuta "mempunk" sin argumentos para ver ayuda.',
    'cli.help': `Uso: mempunk <comando> [opciones]

Setup:
  setup                             Inicializa, vincula y configura hooks (todo en uno)
  init                              Inicializa el vault en ~/Dev-Brain
  link       [--cli claude|gemini|opencode]  Vincula el vault (default: todos los instalados)
  unlink     [--cli claude|gemini|opencode]  Desvincula el vault
  status                            Dashboard: vault, proyectos y sesiones
  doctor                            Verifica integridad del vault
  auto-start on|off                 Activa/desactiva auto-start al iniciar sesión
  cli      list                     Muestra CLIs vinculados al vault
  -v                                Muestra la versión del CLI

Proyectos:
  project  add <id> <name>          Crea un proyecto
  project  list                     Lista proyectos activos
  remove   <id> --yes               Elimina un proyecto (irreversible)
  log      <id>                     Abre el INDEX.md del proyecto en el editor

Backlog:
  backlog  add <proj> "<title>"     Agrega tarea al backlog
  backlog  list <proj>              Lista tareas del backlog
  backlog  update <id>              Actualiza una tarea

Conocimiento:
  decision add <proj> "<title>"     Crea una decisión (ADR)
  decision list <proj>              Lista decisiones del proyecto
  skill    add <proj> <name>        Crea un skill de proyecto
  skill    list <proj>              Lista skills del proyecto
  skill    update <id>              Actualiza contenido de un skill
  resource add <proj> "<title>"     Captura un resource externo
  resource list <proj>              Lista resources del proyecto

Sesiones y logs:
  session  log <proj> "<summary>"   Registra sesión de trabajo
  session  last <proj>              Muestra la última sesión
  daily    log <proj> "<content>"   Agrega una entrada al log diario
  daily    list <proj>              Lista los logs diarios del proyecto
  search   "<query>"                Búsqueda full-text en el vault

Mantenimiento:
  sync                              Verifica consistencia vault ↔ BD
  vault    version                  Muestra la versión del vault y del CLI
  vault    upgrade                  Actualiza el vault a la versión más reciente
  hooks    install                  Instala hooks globalmente en ~/.claude/hooks/
  hooks    install --local          Instala hooks en .claude/hooks/ del proyecto actual
  hooks    install --check          Verifica si los hooks están activos
  hooks    uninstall                Elimina hooks de Mempunk (global por defecto)`,

    // output.js
    'output.noResults': '(sin resultados)',

    // lib/vault.js
    'vault.notInitialized': 'El vault no existe en {path}. Ejecuta "mempunk init" primero.',
    'vault.outdated': 'Vault desactualizado (v{current} → v{required}). Ejecuta mempunk vault upgrade.',

    // lib/config-files.js
    'config.parseError': 'No se pudo parsear {path}: {message}\nCorrige el JSON manualmente y vuelve a intentar.',

    // lib/cli-defs.js
    'cli.unknownCli': 'CLI desconocido: "{flag}". Opciones: claude, gemini, opencode',

    // init
    'init.done': 'Vault inicializado en {path}',

    // project
    'project.pathNotFound': 'La ruta indicada en --path no existe: {path}',
    'project.created': 'Proyecto "{name}" creado en {path}',
    'project.dirMapped': 'Directorio mapeado: {root} → {id}',
    'project.active': 'Proyecto activo: {id}',
    'project.notFoundHint': 'Proyecto no encontrado: "{id}". Usa mempunk project list para ver los disponibles.',
    'project.notFound': 'Proyecto no encontrado: {id}',

    // backlog
    'backlog.added': 'Tarea agregada con id {id}',
    'backlog.updateNoFields': 'Especifica al menos --status o --priority para actualizar',
    'backlog.updated': 'Tarea {id} actualizada',

    // decision
    'decision.saved': 'Decisión guardada en {path}',

    // skill
    'skill.created': 'Skill {name} creado en {path}',
    'skill.fileNotFound': 'Archivo no encontrado: {path}',
    'skill.updated': 'Skill {id} actualizado',

    // resource
    'resource.saved': 'Resource guardado en {path}',

    // daily
    'daily.appended': 'Log agregado a {path}',
    'daily.created': 'Log creado en {path}',

    // session
    'session.logged': 'Sesión registrada para {id}',
    'session.none': 'No hay sesiones registradas para el proyecto "{id}"',
    'session.noSnapshots': 'No hay snapshots guardados para el proyecto "{id}"',
    'session.checkpointHint': 'Los checkpoints se guardan automáticamente cada 5 turnos (hook on-stop).',
    'session.compactHint': 'Los compact_snapshots se guardan antes de cada compactación (hook on-compact).',
    'session.lastSnapshot': 'Último snapshot disponible: {date} ({type})',
    'session.snapshotMeta': 'Session ID: {sessionId} | Mensajes: {count}',
    'session.filesTouched': 'Archivos tocados:',
    'session.commandsRun': 'Comandos corridos:',
    'session.lastMessages': 'Últimos mensajes:',
    'session.seeCheckpoints': 'Para ver checkpoints completos: mempunk session checkpoints {id}',
    'session.unknownDate': 'desconocida',
    'session.noCheckpoints': 'No hay checkpoints para el proyecto "{id}"',
    'session.checkpointsHeader': 'Checkpoints de {id} (más reciente primero):',
    'session.colDate': 'Fecha',
    'session.colType': 'Tipo',
    'session.colDetail': 'Detalle',
    'session.colFiles': 'Archivos',
    'session.turnLabel': 'turno {n}',
    'session.tmpReadError': 'No se pudo leer el archivo temporal: {message}',
    'session.tmpIncomplete': 'Datos incompletos en el archivo temporal',

    // search
    'search.noResults': 'Sin resultados',

    // sync
    'sync.ok': 'Vault sincronizado correctamente',
    'sync.missingFiles': 'Registros sin archivo en disco:',
    'sync.unregistered': 'Archivos sin registro en BD:',
    'sync.missingScaffold': 'Archivos de scaffold faltantes:',
    'sync.colFile': 'archivo',

    // vault (comandos)
    'vault.upgradeHint': '⚠ Tu vault está en v{version}. Ejecuta mempunk vault upgrade para actualizarlo.',
    'vault.ok': 'Vault v{version} — OK',
    'vault.alreadyLatest': 'El vault ya está en la versión más reciente (v{version})',
    'vault.upgraded': 'Vault actualizado a v{version} ({count} migración(es) aplicadas)',
    'vault.backupIntegrityFailed': 'El backup no pasó la verificación de integridad: {result}',
    'vault.backupCreated': 'Backup creado: {path} (integridad ✓)',
    'export.created': 'Export creado: {path} ({tables} tablas, {rows} filas)',

    // hooks (comandos)
    'hooks.bundleMissing': 'Hook bundleado no encontrado: {path} — ejecuta npm run build',
    'hooks.checkHooksHeader': 'Hooks ({dir}):',
    'hooks.checkSettingsHeader': 'Registro en settings.json ({path}):',
    'hooks.checkAgentsHeader': 'Agentes ({dir}):',
    'hooks.statuslineConfigured': 'Statusline configurado en {path}',
    'hooks.statuslineUnchanged': 'Statusline ya configurado — no se modificó settings.json',
    'hooks.agentsInstalled': 'Agentes instalados en {dir}',
    'hooks.installed': 'Hooks instalados en {dir}',
    'hooks.removed': 'Hooks eliminados de {dir}',
    'hooks.noneFound': 'No se encontraron hooks de Mempunk en {dir}',
    'hooks.agentsRemoved': 'Agentes eliminados de {dir}',
    'hooks.statuslineUnregistered': 'Statusline desregistrado de settings.json',

    // auto-start
    'autostart.status': 'Auto-start: {state}',
    'autostart.alreadyOn': 'Auto-start ya estaba activo',
    'autostart.requiresHooks': '! Auto-start requiere que los hooks estén instalados.\n  Ejecuta primero: mempunk hooks install\n',
    'autostart.enabled': 'Auto-start activado',
    'autostart.alreadyOff': 'Auto-start ya estaba inactivo',
    'autostart.disabled': 'Auto-start desactivado',
    'autostart.unknownAction': 'Acción desconocida: "{action}". Usa: on | off',

    // link / unlink / cli list
    'link.linked': 'Vault vinculado a {name}: {path}',
    'link.alreadyLinked': 'Vault ya vinculado a {name}',
    'link.restart': 'Reinicia los CLIs para aplicar el cambio.',
    'link.unlinked': 'Vault desvinculado de {name}',
    'link.notLinked': 'Vault no estaba vinculado a {name}',
    'cliList.header': 'CLIs compatibles con Mempunk:',
    'cliList.notInstalled': '(no instalado)',
    'cliList.linked': '(vinculado)',
    'cliList.notLinkedHint': '(no vinculado — mempunk link --cli {flag})',

    // log (abrir en editor)
    'log.dirNotFound': 'Directorio no encontrado: {dir}',
    'log.opened': 'Abierto: {target}',

    // remove
    'remove.confirm': 'Operación destructiva. Confirma con: mempunk remove {id} --yes',
    'remove.done': 'Proyecto "{id}" eliminado',

    // status
    'status.linked': 'vinculado',
    'status.notLinked': 'no vinculado (mempunk link --cli {flag})',
    'status.projects': 'Proyectos: {count}',
    'status.none': '(sin proyectos registrados)',
    'status.backlogLine': 'backlog: {pending} pendiente(s) / {inProgress} en curso  |  última sesión: {date}',

    // doctor
    'doctor.dbFound': 'Base de datos encontrada',
    'doctor.dbMissing': 'Base de datos no encontrada — ejecuta mempunk init',
    'doctor.outdated': 'Vault desactualizado (v{current} → v{required}) — ejecuta mempunk vault upgrade',
    'doctor.upToDate': 'Vault v{version} — actualizado',
    'doctor.projectCount': '{count} proyecto(s) en BD',
    'doctor.dirMissing': 'Proyecto "{id}": directorio no encontrado en disco',
    'doctor.missingDecisions': 'Proyecto "{id}": falta decisions/',
    'doctor.missingSkills': 'Proyecto "{id}": falta skills/',
    'doctor.linked': 'Vault vinculado a {name}',
    'doctor.notLinked': 'Vault no vinculado a {name} — ejecuta mempunk link --cli {flag}',
    'doctor.hooksInstalled': 'Hooks instalados ({scope})',
    'doctor.hooksMissing': 'Hooks no instalados — ejecuta mempunk hooks install',
    'doctor.agentsInstalled': 'Agentes instalados ({scope})',
    'doctor.agentsMissing': 'Agentes no instalados — ejecuta mempunk hooks install',
    'doctor.logErrors': 'hooks.log contiene {count} error(es) reciente(s) — revisa: {path}',
    'doctor.logOk': 'hooks.log sin errores recientes',
    'doctor.activeInvalid': 'active-project.json existe pero no es JSON válido — ejecuta mempunk project activate <id>',
    'doctor.noActive': 'Sin proyecto activo — los hooks no pueden guardar checkpoints\n    Solución: mempunk project activate <id>\n    Ejemplo:  mempunk project activate {example}',
    'doctor.allGood': 'Todo en orden',
    'doctor.errorCount': '{count} error(s)',
    'doctor.warningCount': '{count} advertencia(s)',

    // setup
    'setup.vaultCreated': '✓ Vault creado en {path}',
    'setup.vaultExists': '✓ Vault existente en {path}',
    'setup.askCli': '\n¿Qué AI CLI usas principalmente?',
    'setup.cliOption1': '  1. Claude Code',
    'setup.cliOption2': '  2. Gemini CLI / opencode / otra\n',
    'setup.choose': 'Elige (1 o 2): ',
    'setup.askMode': '\n¿Cómo quieres que funcione Mempunk?',
    'setup.modeOption1': '  1. Automático — hooks + agentes  (recomendado)',
    'setup.modeOption1a': '     Los hooks guardan checkpoints solos y @mempunk-loader',
    'setup.modeOption1b': '     carga el contexto al inicio de cada sesión.',
    'setup.modeOption2': '  2. Manual — solo vault-skills',
    'setup.modeOption2a': '     Corres los protocolos tú mismo al inicio/fin de sesión.\n',
    'setup.invalidMode': '--setup-mode inválido: "{mode}". Usa: auto | manual | vault-skills',
    'setup.linked': '✓ Vault vinculado a {name}',
    'setup.alreadyLinked': '✓ Vault ya vinculado a {name}',
    'setup.noCliDetected': '! No se detectó Gemini CLI ni opencode instalados. Vincula manualmente con:',
    'setup.noCliDetectedHint': '    mempunk link --cli gemini   (o opencode)',
    'setup.vaultSkills': '✓ vault-skills instalados en {path}',
    'setup.nextStep': 'Próximo paso:',
    'setup.nextStepCmd': '  mempunk project add <id> "<nombre del proyecto>"',
    'setup.autoHint': '\nAl iniciar Claude Code: @mempunk-loader se ejecuta automáticamente.',
    'setup.manualHint': '\nPara cargar contexto al inicio de sesión:',
    'setup.manualHintRead': '  Lee {path}',
    'setup.migrateHint': '\nSi migras a Claude Code en el futuro:',
    'setup.migrateHintCmd': '  mempunk setup --setup-mode auto',
  },
};

// Idioma activo — resuelto una sola vez al cargar el módulo.
// MEMPUNK_LANG que empiece con "es" → español; cualquier otra cosa → inglés.
const LANG = (process.env.MEMPUNK_LANG ?? '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';

/**
 * Devuelve el mensaje traducido para `key`, interpolando placeholders {name}.
 * Fallback: idioma activo → inglés → la clave tal cual. Nunca lanza.
 * @param {string} key - Clave semántica del catálogo (p.ej. 'project.created')
 * @param {Record<string, unknown>} [params] - Valores para los placeholders
 * @returns {string}
 */
export function t(key, params = {}) {
  const template = MESSAGES[LANG][key] ?? MESSAGES.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params[name] !== undefined ? String(params[name]) : match
  );
}
