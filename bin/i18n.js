const translations = {
  en: {
    help: `
  mempunk — Persistent dev brain for AI coding CLIs (Claude Code, opencode, gemini-cli)

  Usage:
    mempunk setup                  Interactive full setup (recommended)
    mempunk init [path] [options]  Create a new vault
    mempunk project <name>         Add a new project to the vault
    mempunk remove <name>          Remove a project from the vault
    mempunk sync                   Add missing template files to existing projects
    mempunk doctor                 Check vault health and integrity
    mempunk log <name>             Open a project's session log
    mempunk backlog <name>         Show a project's backlog
    mempunk link <path>            Link vault to your active CLIs
    mempunk unlink                 Remove vault from your CLIs' config
    mempunk cli add <name>         Add a CLI (claude-code, opencode, gemini-cli)
    mempunk cli remove <name>      Remove a CLI
    mempunk cli list               Show active CLIs
    mempunk auto-start [on|off]    Auto-run /mempunk on new sessions
    mempunk status                 Show linked vaults and active CLIs
    mempunk help                   Show this message

  Options:
    --lang <code>      Language: en, es, pt, fr (default: en)
    --preset <name>    Preset: full, standard, minimal
    --projects         Include projects folder
    --areas            Include areas folder
    --resources        Include resources folder
    --daily            Include daily folder

  Examples:
    mempunk setup
    mempunk setup --lang es
    mempunk init ./my-vault --preset full
    mempunk project my-app
    mempunk remove my-app
    mempunk log my-app
    mempunk link ./my-vault
`,
    setupTitle: "vault setup",
    selectLanguage: "Select language",
    whereVault: "Where do you want your vault?",
    vaultAlreadyExists: "Vault already exists at",
    linkExisting: "Link it to {cli}?",
    selectStructure: "Select vault structure",
    selectFolders: "Select folders to include",
    selectCLI: "Which AI CLI will you use with mempunk?",
    linkQuestion: "Link vault to {cli}?",
    done: "Open {cli} in any project to start using your vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — projects only",
    presetCustom: "Custom — pick folders",

    folderProjects: "projects  — One dir per active project",
    folderAreas: "areas     — Ongoing responsibilities",
    folderResources: "resources — Reusable technical knowledge",
    folderDaily: "daily     — Session logs written by Claude",

    creatingVault: "Creating vault...",
    linkingVault: "Linking to {cli}...",
    vaultCreated: "Vault created at",
    errorVaultExists: "Error: vault already exists at",
    errorUnknownPreset: "Error: unknown preset",
    usePresets: "Use: full, standard, minimal",

    errorPathRequired: "Error: path required. Usage: mempunk link <path>",
    errorPathNotExist: "Error: path does not exist:",
    errorNoClaude: "Error: no CLAUDE.md found at",
    runInitFirst: "Run 'mempunk init' first to create a vault.",
    alreadyLinked: "Already linked:",
    vaultLinked: "Vault linked",
    linkSuccess: "{cli} will have access to the vault in every session.",

    noVaultLinked: "No vault linked.",
    vaultUnlinked: "Vault unlinked:",
    notLinked: "Vault not linked:",
    unlinkWhich: "Which vault do you want to unlink?",
    unlinkAll: "All vaults",
    allVaultsUnlinked: "All vaults unlinked.",

    linkedVaults: "Linked vaults:",
    notFound: "not found",
    noVaultSetup: "No vault linked. Run 'mempunk setup' to get started.",

    statusProjects: "Projects",
    statusNoProjects: "No projects found. Run 'mempunk project <name>' to add one.",
    statusLastSession: "Last session:",
    statusNoSessions: "no sessions yet",
    statusBacklog: "Backlog:",
    statusNoBacklog: "empty",
    statusPending: "pending",
    statusDone: "done",

    promptTitle: "Type this in any {cli} session:",
    promptAlt: "Or paste: Read the CLAUDE.md at \"{path}\" and follow the session start protocol.",

    installingSkill: "Installing /mempunk and /session-end commands...",
    skillInstalled: "/mempunk and /session-end installed globally",

    selectVault: "Which vault do you want to use?",
    errorProjectName: "Error: project name required. Usage: mempunk project <name>",
    errorNoVault: "Error: no vault found. Run 'mempunk setup' first.",
    errorProjectExists: "Error: project already exists:",
    creatingProject: "Creating project {name}...",
    projectCreated: "Project created:",

    errorLogProjectName: "Error: project name required. Usage: mempunk log <name>",
    errorLogNotFound: "Error: session-log.md not found for project:",
    logOpened: "Opened session-log for",

    errorBacklogProjectName: "Error: project name required. Usage: mempunk backlog <name>",
    errorBacklogNotFound: "Error: backlog.md not found for project:",
    backlogTitle: "Backlog —",

    errorRemoveProjectName: "Error: project name required. Usage: mempunk remove <name>",
    errorRemoveNotFound: "Error: project not found:",
    removeWarning: "This will permanently delete project:",
    removePath: "Path:",
    removeConfirm: "Are you sure you want to delete {name}?",
    removeCancelled: "Remove cancelled.",
    removingProject: "Removing project {name}...",
    projectRemoved: "Project removed:",

    syncScanning: "Scanning",
    syncProjects: "projects",
    syncUpToDate: "up to date",
    syncDone: "Sync complete.",
    syncFilesCreated: "files created.",
    syncAllUpToDate: "All projects are up to date.",

    doctorTitle: "Vault health check",
    doctorVaultPath: "Vault:",
    doctorNoClaude: "CLAUDE.md not found in vault",
    doctorClaudeOk: "CLAUDE.md found",
    doctorNoMarkers: "CLAUDE.md has no project markers (<!-- MEMPUNK:PROJECTS -->)",
    doctorGhostProject: "Registered in CLAUDE.md but missing on disk:",
    doctorOrphanProject: "Exists on disk but not registered in CLAUDE.md:",
    doctorMissingFiles: "missing:",
    doctorNoMempunkSkill: "/mempunk slash command not installed",
    doctorMempunkSkillOk: "/mempunk slash command installed",
    doctorNoSessionEndSkill: "/session-end slash command not installed",
    doctorSessionEndSkillOk: "/session-end slash command installed",
    doctorAllGood: "Vault is healthy. No issues found.",
    doctorIssues: "issues found",
    doctorWarnings: "warnings found",
    doctorRunSync: "Tip: run 'mempunk sync' to fix missing project files.",

    warnCorruptConfig: "Warning: corrupted config file at",
    errorWriteConfig: "Error: failed to write config:",
    errorSelectOne: "Select at least one folder",
    errorUnknownLang: "Unknown language:",
    availableLangs: "Available:",

    structure: "Structure",

    cliAddSuccess: "CLI added:",
    cliAlreadyActive: "CLI already active:",
    cliRemoveSuccess: "CLI removed:",
    cliNotActive: "CLI not active:",
    cliCannotRemoveLast: "Cannot remove the last active CLI.",
    cliListTitle: "Active CLIs:",
    cliNameRequired: "Error: CLI name required. Options: claude-code, opencode, gemini-cli",
    cliUnknown: "Error: unknown CLI:",
    cliAvailable: "Available:",
    cliNotInstalled: "Warning: {cli} does not appear to be installed.",
    cliLinkingAll: "Linking to {count} CLIs...",
    cliUnlinkingAll: "Unlinking from {count} CLIs...",
    cliInstallingSkills: "Installing skills for {count} CLIs...",
    selectCLIs: "Which AI CLIs will you use with mempunk?",
    autoStartEnabled: "Auto-start enabled for",
    autoStartDisabled: "Auto-start disabled for",
    autoStartStatus: "Auto-start status:",
    autoStartOn: "enabled",
    autoStartOff: "disabled",
    autoStartNotAvailable: "Auto-start is only available for Claude Code and gemini-cli.",
    autoStartUsage: "Usage: mempunk auto-start [on|off]",
    autoStartSelectCLI: "Which CLI do you want to configure?",
  },

  es: {
    help: `
  mempunk — Cerebro persistente para CLIs de IA (Claude Code, opencode, gemini-cli)

  Uso:
    mempunk setup                  Setup interactivo completo (recomendado)
    mempunk init [ruta] [opciones] Crear un nuevo vault
    mempunk project <nombre>       Agregar un nuevo proyecto al vault
    mempunk remove <nombre>        Eliminar un proyecto del vault
    mempunk sync                   Agregar archivos faltantes a proyectos existentes
    mempunk doctor                 Verificar salud e integridad del vault
    mempunk log <nombre>           Abrir el session log de un proyecto
    mempunk backlog <nombre>       Ver el backlog de un proyecto
    mempunk link <ruta>            Vincular vault a tus CLIs activos
    mempunk unlink                 Desvincular vault de tus CLIs
    mempunk cli add <nombre>       Agregar un CLI (claude-code, opencode, gemini-cli)
    mempunk cli remove <nombre>    Quitar un CLI
    mempunk cli list               Mostrar CLIs activos
    mempunk auto-start [on|off]    Auto-ejecutar /mempunk en nuevas sesiones
    mempunk status                 Mostrar vaults vinculados y CLIs activos
    mempunk help                   Mostrar este mensaje

  Opciones:
    --lang <codigo>    Idioma: en, es, pt, fr (por defecto: en)
    --preset <nombre>  Preset: full, standard, minimal
    --projects         Incluir carpeta projects
    --areas            Incluir carpeta areas
    --resources        Incluir carpeta resources
    --daily            Incluir carpeta daily

  Ejemplos:
    mempunk setup
    mempunk setup --lang es
    mempunk init ./mi-vault --preset full
    mempunk project mi-app
    mempunk remove mi-app
    mempunk link ./mi-vault
`,
    setupTitle: "configuracion del vault",
    selectLanguage: "Selecciona idioma",
    whereVault: "Donde quieres crear tu vault?",
    vaultAlreadyExists: "Ya existe un vault en",
    linkExisting: "Vincularlo a {cli}?",
    selectStructure: "Selecciona la estructura del vault",
    selectCLI: "¿Que CLI de IA vas a usar con mempunk?",
    selectFolders: "Selecciona las carpetas a incluir",
    linkQuestion: "Vincular vault a {cli}?",
    done: "Abre {cli} en cualquier proyecto para empezar a usar tu vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — solo projects",
    presetCustom: "Custom — elegir carpetas",

    folderProjects: "projects  — Un dir por proyecto activo",
    folderAreas: "areas     — Responsabilidades continuas",
    folderResources: "resources — Conocimiento tecnico reutilizable",
    folderDaily: "daily     — Logs de sesion por Claude",

    creatingVault: "Creando vault...",
    linkingVault: "Vinculando a {cli}...",
    vaultCreated: "Vault creado en",
    errorVaultExists: "Error: ya existe un vault en",
    errorUnknownPreset: "Error: preset desconocido",
    usePresets: "Usa: full, standard, minimal",

    errorPathRequired: "Error: ruta requerida. Uso: mempunk link <ruta>",
    errorPathNotExist: "Error: la ruta no existe:",
    errorNoClaude: "Error: no se encontro CLAUDE.md en",
    runInitFirst: "Ejecuta 'mempunk init' primero para crear un vault.",
    alreadyLinked: "Ya vinculado:",
    vaultLinked: "Vault vinculado",
    linkSuccess: "{cli} tendra acceso al vault en cada sesion.",

    noVaultLinked: "No hay vault vinculado.",
    vaultUnlinked: "Vault desvinculado:",
    notLinked: "Vault no vinculado:",
    unlinkWhich: "Cual vault quieres desvincular?",
    unlinkAll: "Todos los vaults",
    allVaultsUnlinked: "Todos los vaults desvinculados.",

    linkedVaults: "Vaults vinculados:",
    notFound: "no encontrado",
    noVaultSetup: "No hay vault vinculado. Ejecuta 'mempunk setup' para comenzar.",

    statusProjects: "Proyectos",
    statusNoProjects: "Sin proyectos. Ejecuta 'mempunk project <nombre>' para agregar uno.",
    statusLastSession: "Ultima sesion:",
    statusNoSessions: "sin sesiones aun",
    statusBacklog: "Backlog:",
    statusNoBacklog: "vacio",
    statusPending: "pendientes",
    statusDone: "completadas",

    promptTitle: "Escribe esto en cualquier sesion de {cli}:",
    promptAlt: "O pega: Lee el CLAUDE.md en \"{path}\" y sigue el protocolo de inicio de sesion.",

    installingSkill: "Instalando /mempunk y /session-end...",
    skillInstalled: "/mempunk y /session-end instalados globalmente",

    selectVault: "En cual vault quieres trabajar?",
    errorProjectName: "Error: nombre de proyecto requerido. Uso: mempunk project <nombre>",
    errorNoVault: "Error: no se encontro un vault. Ejecuta 'mempunk setup' primero.",
    errorProjectExists: "Error: el proyecto ya existe:",
    creatingProject: "Creando proyecto {name}...",
    projectCreated: "Proyecto creado:",

    errorLogProjectName: "Error: nombre de proyecto requerido. Uso: mempunk log <nombre>",
    errorLogNotFound: "Error: session-log.md no encontrado para el proyecto:",
    logOpened: "Session-log abierto para",

    errorBacklogProjectName: "Error: nombre de proyecto requerido. Uso: mempunk backlog <nombre>",
    errorBacklogNotFound: "Error: backlog.md no encontrado para el proyecto:",
    backlogTitle: "Backlog —",

    errorRemoveProjectName: "Error: nombre de proyecto requerido. Uso: mempunk remove <nombre>",
    errorRemoveNotFound: "Error: proyecto no encontrado:",
    removeWarning: "Esto eliminara permanentemente el proyecto:",
    removePath: "Ruta:",
    removeConfirm: "Estas seguro de eliminar {name}?",
    removeCancelled: "Eliminacion cancelada.",
    removingProject: "Eliminando proyecto {name}...",
    projectRemoved: "Proyecto eliminado:",

    syncScanning: "Escaneando",
    syncProjects: "proyectos",
    syncUpToDate: "al dia",
    syncDone: "Sincronizacion completa.",
    syncFilesCreated: "archivos creados.",
    syncAllUpToDate: "Todos los proyectos estan al dia.",

    doctorTitle: "Verificacion de salud del vault",
    doctorVaultPath: "Vault:",
    doctorNoClaude: "CLAUDE.md no encontrado en el vault",
    doctorClaudeOk: "CLAUDE.md encontrado",
    doctorNoMarkers: "CLAUDE.md no tiene marcadores de proyectos (<!-- MEMPUNK:PROJECTS -->)",
    doctorGhostProject: "Registrado en CLAUDE.md pero no existe en disco:",
    doctorOrphanProject: "Existe en disco pero no registrado en CLAUDE.md:",
    doctorMissingFiles: "faltan:",
    doctorNoMempunkSkill: "Slash command /mempunk no instalado",
    doctorMempunkSkillOk: "Slash command /mempunk instalado",
    doctorNoSessionEndSkill: "Slash command /session-end no instalado",
    doctorSessionEndSkillOk: "Slash command /session-end instalado",
    doctorAllGood: "El vault esta saludable. Sin problemas.",
    doctorIssues: "problemas encontrados",
    doctorWarnings: "advertencias encontradas",
    doctorRunSync: "Tip: ejecuta 'mempunk sync' para arreglar archivos faltantes.",

    warnCorruptConfig: "Advertencia: archivo de config corrupto en",
    errorWriteConfig: "Error: no se pudo escribir la config:",
    errorSelectOne: "Selecciona al menos una carpeta",
    errorUnknownLang: "Idioma desconocido:",
    availableLangs: "Disponibles:",

    structure: "Estructura",

    cliAddSuccess: "CLI agregado:",
    cliAlreadyActive: "CLI ya activo:",
    cliRemoveSuccess: "CLI eliminado:",
    cliNotActive: "CLI no activo:",
    cliCannotRemoveLast: "No se puede eliminar el ultimo CLI activo.",
    cliListTitle: "CLIs activos:",
    cliNameRequired: "Error: nombre de CLI requerido. Opciones: claude-code, opencode, gemini-cli",
    cliUnknown: "Error: CLI desconocido:",
    cliAvailable: "Disponibles:",
    cliNotInstalled: "Advertencia: {cli} no parece estar instalado.",
    cliLinkingAll: "Vinculando a {count} CLIs...",
    cliUnlinkingAll: "Desvinculando de {count} CLIs...",
    cliInstallingSkills: "Instalando skills en {count} CLIs...",
    selectCLIs: "¿Que CLIs de IA vas a usar con mempunk?",
    autoStartEnabled: "Auto-start activado para",
    autoStartDisabled: "Auto-start desactivado para",
    autoStartStatus: "Estado de auto-start:",
    autoStartOn: "activado",
    autoStartOff: "desactivado",
    autoStartNotAvailable: "Auto-start solo esta disponible para Claude Code y gemini-cli.",
    autoStartUsage: "Uso: mempunk auto-start [on|off]",
    autoStartSelectCLI: "Para cual CLI deseas configurar auto-start?",
  },

  pt: {
    help: `
  mempunk — Cérebro persistente para CLIs de IA (Claude Code, opencode, gemini-cli)

  Uso:
    mempunk setup                  Setup interativo completo (recomendado)
    mempunk init [caminho] [opções] Criar um novo vault
    mempunk project <nome>         Adicionar um novo projeto ao vault
    mempunk remove <nome>          Remover um projeto do vault
    mempunk sync                   Adicionar arquivos faltantes a projetos existentes
    mempunk doctor                 Verificar saúde e integridade do vault
    mempunk log <nome>             Abrir o session log de um projeto
    mempunk backlog <nome>         Ver o backlog de um projeto
    mempunk link <caminho>         Vincular vault aos seus CLIs ativos
    mempunk unlink                 Desvincular vault dos seus CLIs
    mempunk cli add <nome>         Adicionar um CLI (claude-code, opencode, gemini-cli)
    mempunk cli remove <nome>      Remover um CLI
    mempunk cli list               Mostrar CLIs ativos
    mempunk auto-start [on|off]    Auto-executar /mempunk em novas sessoes
    mempunk status                 Mostrar vaults vinculados e CLIs ativos
    mempunk help                   Mostrar esta mensagem

  Opções:
    --lang <código>    Idioma: en, es, pt, fr (padrão: en)
    --preset <nome>    Preset: full, standard, minimal
    --projects         Incluir pasta projects
    --areas            Incluir pasta areas
    --resources        Incluir pasta resources
    --daily            Incluir pasta daily

  Exemplos:
    mempunk setup
    mempunk setup --lang pt
    mempunk init ./meu-vault --preset full
    mempunk project meu-app
    mempunk remove meu-app
    mempunk link ./meu-vault
`,
    setupTitle: "configuração do vault",
    selectLanguage: "Selecione o idioma",
    whereVault: "Onde você quer criar seu vault?",
    vaultAlreadyExists: "Já existe um vault em",
    linkExisting: "Vincular ao {cli}?",
    selectStructure: "Selecione a estrutura do vault",
    selectCLI: "Qual CLI de IA voce vai usar com o mempunk?",
    selectFolders: "Selecione as pastas a incluir",
    linkQuestion: "Vincular vault ao {cli}?",
    done: "Abra {cli} em qualquer projeto para começar a usar seu vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — apenas projects",
    presetCustom: "Custom — escolher pastas",

    folderProjects: "projects  — Um dir por projeto ativo",
    folderAreas: "areas     — Responsabilidades contínuas",
    folderResources: "resources — Conhecimento técnico reutilizável",
    folderDaily: "daily     — Logs de sessão pelo Claude",

    creatingVault: "Criando vault...",
    linkingVault: "Vinculando ao {cli}...",
    vaultCreated: "Vault criado em",
    errorVaultExists: "Erro: já existe um vault em",
    errorUnknownPreset: "Erro: preset desconhecido",
    usePresets: "Use: full, standard, minimal",

    errorPathRequired: "Erro: caminho necessário. Uso: mempunk link <caminho>",
    errorPathNotExist: "Erro: o caminho não existe:",
    errorNoClaude: "Erro: CLAUDE.md não encontrado em",
    runInitFirst: "Execute 'mempunk init' primeiro para criar um vault.",
    alreadyLinked: "Já vinculado:",
    vaultLinked: "Vault vinculado",
    linkSuccess: "{cli} terá acesso ao vault em cada sessão.",

    noVaultLinked: "Nenhum vault vinculado.",
    vaultUnlinked: "Vault desvinculado:",
    notLinked: "Vault não vinculado:",
    unlinkWhich: "Qual vault você quer desvincular?",
    unlinkAll: "Todos os vaults",
    allVaultsUnlinked: "Todos os vaults desvinculados.",

    linkedVaults: "Vaults vinculados:",
    notFound: "não encontrado",
    noVaultSetup: "Nenhum vault vinculado. Execute 'mempunk setup' para começar.",

    statusProjects: "Projetos",
    statusNoProjects: "Sem projetos. Execute 'mempunk project <nome>' para adicionar um.",
    statusLastSession: "Última sessão:",
    statusNoSessions: "sem sessões ainda",
    statusBacklog: "Backlog:",
    statusNoBacklog: "vazio",
    statusPending: "pendentes",
    statusDone: "concluídas",

    promptTitle: "Digite isso em qualquer sessão do {cli}:",
    promptAlt: "Ou cole: Leia o CLAUDE.md em \"{path}\" e siga o protocolo de início de sessão.",

    installingSkill: "Instalando /mempunk e /session-end...",
    skillInstalled: "/mempunk e /session-end instalados globalmente",

    selectVault: "Em qual vault voce quer trabalhar?",
    errorProjectName: "Erro: nome do projeto necessário. Uso: mempunk project <nome>",
    errorNoVault: "Erro: nenhum vault encontrado. Execute 'mempunk setup' primeiro.",
    errorProjectExists: "Erro: o projeto já existe:",
    creatingProject: "Criando projeto {name}...",
    projectCreated: "Projeto criado:",

    errorLogProjectName: "Erro: nome do projeto necessário. Uso: mempunk log <nome>",
    errorLogNotFound: "Erro: session-log.md não encontrado para o projeto:",
    logOpened: "Session-log aberto para",

    errorBacklogProjectName: "Erro: nome do projeto necessário. Uso: mempunk backlog <nome>",
    errorBacklogNotFound: "Erro: backlog.md não encontrado para o projeto:",
    backlogTitle: "Backlog —",

    errorRemoveProjectName: "Erro: nome do projeto necessário. Uso: mempunk remove <nome>",
    errorRemoveNotFound: "Erro: projeto não encontrado:",
    removeWarning: "Isso vai excluir permanentemente o projeto:",
    removePath: "Caminho:",
    removeConfirm: "Tem certeza que deseja excluir {name}?",
    removeCancelled: "Remoção cancelada.",
    removingProject: "Removendo projeto {name}...",
    projectRemoved: "Projeto removido:",

    syncScanning: "Escaneando",
    syncProjects: "projetos",
    syncUpToDate: "atualizado",
    syncDone: "Sincronização completa.",
    syncFilesCreated: "arquivos criados.",
    syncAllUpToDate: "Todos os projetos estão atualizados.",

    doctorTitle: "Verificação de saúde do vault",
    doctorVaultPath: "Vault:",
    doctorNoClaude: "CLAUDE.md não encontrado no vault",
    doctorClaudeOk: "CLAUDE.md encontrado",
    doctorNoMarkers: "CLAUDE.md não tem marcadores de projetos (<!-- MEMPUNK:PROJECTS -->)",
    doctorGhostProject: "Registrado no CLAUDE.md mas não existe no disco:",
    doctorOrphanProject: "Existe no disco mas não registrado no CLAUDE.md:",
    doctorMissingFiles: "faltam:",
    doctorNoMempunkSkill: "Slash command /mempunk não instalado",
    doctorMempunkSkillOk: "Slash command /mempunk instalado",
    doctorNoSessionEndSkill: "Slash command /session-end não instalado",
    doctorSessionEndSkillOk: "Slash command /session-end instalado",
    doctorAllGood: "O vault está saudável. Sem problemas.",
    doctorIssues: "problemas encontrados",
    doctorWarnings: "avisos encontrados",
    doctorRunSync: "Dica: execute 'mempunk sync' para corrigir arquivos faltantes.",

    warnCorruptConfig: "Aviso: arquivo de config corrompido em",
    errorWriteConfig: "Erro: falha ao escrever a config:",
    errorSelectOne: "Selecione pelo menos uma pasta",
    errorUnknownLang: "Idioma desconhecido:",
    availableLangs: "Disponíveis:",

    structure: "Estrutura",

    cliAddSuccess: "CLI adicionado:",
    cliAlreadyActive: "CLI ja ativo:",
    cliRemoveSuccess: "CLI removido:",
    cliNotActive: "CLI nao ativo:",
    cliCannotRemoveLast: "Nao e possivel remover o ultimo CLI ativo.",
    cliListTitle: "CLIs ativos:",
    cliNameRequired: "Erro: nome do CLI necessario. Opcoes: claude-code, opencode, gemini-cli",
    cliUnknown: "Erro: CLI desconhecido:",
    cliAvailable: "Disponiveis:",
    cliNotInstalled: "Aviso: {cli} nao parece estar instalado.",
    cliLinkingAll: "Vinculando a {count} CLIs...",
    cliUnlinkingAll: "Desvinculando de {count} CLIs...",
    cliInstallingSkills: "Instalando skills em {count} CLIs...",
    selectCLIs: "Quais CLIs de IA voce vai usar com o mempunk?",
    autoStartEnabled: "Auto-start ativado para",
    autoStartDisabled: "Auto-start desativado para",
    autoStartStatus: "Status do auto-start:",
    autoStartOn: "ativado",
    autoStartOff: "desativado",
    autoStartNotAvailable: "Auto-start so esta disponivel para Claude Code e gemini-cli.",
    autoStartUsage: "Uso: mempunk auto-start [on|off]",
    autoStartSelectCLI: "Para qual CLI deseja configurar auto-start?",
  },

  fr: {
    help: `
  mempunk — Cerveau persistant pour CLI d'IA (Claude Code, opencode, gemini-cli)

  Utilisation:
    mempunk setup                  Configuration interactive complete (recommande)
    mempunk init [chemin] [options] Creer un nouveau vault
    mempunk project <nom>          Ajouter un nouveau projet au vault
    mempunk remove <nom>           Supprimer un projet du vault
    mempunk sync                   Ajouter les fichiers manquants aux projets existants
    mempunk doctor                 Verifier la sante et l'integrite du vault
    mempunk log <nom>              Ouvrir le session log d'un projet
    mempunk backlog <nom>          Voir le backlog d'un projet
    mempunk link <chemin>          Lier le vault a vos CLIs actifs
    mempunk unlink                 Dissocier le vault de vos CLIs
    mempunk cli add <nom>          Ajouter un CLI (claude-code, opencode, gemini-cli)
    mempunk cli remove <nom>       Supprimer un CLI
    mempunk cli list               Afficher les CLIs actifs
    mempunk auto-start [on|off]    Auto-executer /mempunk dans nouvelles sessions
    mempunk status                 Afficher les vaults lies et CLIs actifs
    mempunk help                   Afficher ce message

  Options:
    --lang <code>      Langue: en, es, pt, fr (defaut: en)
    --preset <nom>     Preset: full, standard, minimal
    --projects         Inclure le dossier projects
    --areas            Inclure le dossier areas
    --resources        Inclure le dossier resources
    --daily            Inclure le dossier daily

  Exemples:
    mempunk setup
    mempunk setup --lang fr
    mempunk init ./mon-vault --preset full
    mempunk project mon-app
    mempunk remove mon-app
    mempunk link ./mon-vault
`,
    setupTitle: "configuration du vault",
    selectLanguage: "Choisissez la langue",
    whereVault: "Ou voulez-vous creer votre vault?",
    vaultAlreadyExists: "Un vault existe deja a",
    linkExisting: "Le lier a {cli}?",
    selectStructure: "Choisissez la structure du vault",
    selectCLI: "Quel CLI d'IA allez-vous utiliser avec mempunk?",
    selectFolders: "Choisissez les dossiers a inclure",
    linkQuestion: "Lier le vault a {cli}?",
    done: "Ouvrez {cli} dans n'importe quel projet pour commencer a utiliser votre vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — projects uniquement",
    presetCustom: "Custom — choisir les dossiers",

    folderProjects: "projects  — Un dossier par projet actif",
    folderAreas: "areas     — Responsabilites continues",
    folderResources: "resources — Connaissances techniques reutilisables",
    folderDaily: "daily     — Logs de session par Claude",

    creatingVault: "Creation du vault...",
    linkingVault: "Liaison a {cli}...",
    vaultCreated: "Vault cree a",
    errorVaultExists: "Erreur: un vault existe deja a",
    errorUnknownPreset: "Erreur: preset inconnu",
    usePresets: "Utilisez: full, standard, minimal",

    errorPathRequired: "Erreur: chemin requis. Usage: mempunk link <chemin>",
    errorPathNotExist: "Erreur: le chemin n'existe pas:",
    errorNoClaude: "Erreur: CLAUDE.md non trouve a",
    runInitFirst: "Lancez 'mempunk init' d'abord pour creer un vault.",
    alreadyLinked: "Deja lie:",
    vaultLinked: "Vault lie",
    linkSuccess: "{cli} aura acces au vault dans chaque session.",

    noVaultLinked: "Aucun vault lie.",
    vaultUnlinked: "Vault dissocie:",
    notLinked: "Vault non lie:",
    unlinkWhich: "Quel vault voulez-vous dissocier?",
    unlinkAll: "Tous les vaults",
    allVaultsUnlinked: "Tous les vaults dissocies.",

    linkedVaults: "Vaults lies:",
    notFound: "non trouve",
    noVaultSetup: "Aucun vault lie. Lancez 'mempunk setup' pour commencer.",

    statusProjects: "Projets",
    statusNoProjects: "Aucun projet. Lancez 'mempunk project <nom>' pour en ajouter un.",
    statusLastSession: "Derniere session:",
    statusNoSessions: "aucune session",
    statusBacklog: "Backlog:",
    statusNoBacklog: "vide",
    statusPending: "en attente",
    statusDone: "terminees",

    promptTitle: "Tapez ceci dans n'importe quelle session {cli}:",
    promptAlt: "Ou collez: Lisez le CLAUDE.md a \"{path}\" et suivez le protocole de debut de session.",

    installingSkill: "Installation de /mempunk et /session-end...",
    skillInstalled: "/mempunk et /session-end installes globalement",

    selectVault: "Dans quel vault voulez-vous travailler?",
    errorProjectName: "Erreur: nom du projet requis. Usage: mempunk project <nom>",
    errorNoVault: "Erreur: aucun vault trouve. Lancez 'mempunk setup' d'abord.",
    errorProjectExists: "Erreur: le projet existe deja:",
    creatingProject: "Creation du projet {name}...",
    projectCreated: "Projet cree:",

    errorLogProjectName: "Erreur: nom du projet requis. Usage: mempunk log <nom>",
    errorLogNotFound: "Erreur: session-log.md non trouve pour le projet:",
    logOpened: "Session-log ouvert pour",

    errorBacklogProjectName: "Erreur: nom du projet requis. Usage: mempunk backlog <nom>",
    errorBacklogNotFound: "Erreur: backlog.md non trouve pour le projet:",
    backlogTitle: "Backlog —",

    errorRemoveProjectName: "Erreur: nom du projet requis. Usage: mempunk remove <nom>",
    errorRemoveNotFound: "Erreur: projet non trouve:",
    removeWarning: "Cela supprimera definitivement le projet:",
    removePath: "Chemin:",
    removeConfirm: "Etes-vous sur de vouloir supprimer {name}?",
    removeCancelled: "Suppression annulee.",
    removingProject: "Suppression du projet {name}...",
    projectRemoved: "Projet supprime:",

    syncScanning: "Analyse de",
    syncProjects: "projets",
    syncUpToDate: "a jour",
    syncDone: "Synchronisation terminee.",
    syncFilesCreated: "fichiers crees.",
    syncAllUpToDate: "Tous les projets sont a jour.",

    doctorTitle: "Verification de sante du vault",
    doctorVaultPath: "Vault:",
    doctorNoClaude: "CLAUDE.md non trouve dans le vault",
    doctorClaudeOk: "CLAUDE.md trouve",
    doctorNoMarkers: "CLAUDE.md n'a pas de marqueurs de projets (<!-- MEMPUNK:PROJECTS -->)",
    doctorGhostProject: "Enregistre dans CLAUDE.md mais absent du disque:",
    doctorOrphanProject: "Existe sur le disque mais non enregistre dans CLAUDE.md:",
    doctorMissingFiles: "manquants:",
    doctorNoMempunkSkill: "Slash command /mempunk non installe",
    doctorMempunkSkillOk: "Slash command /mempunk installe",
    doctorNoSessionEndSkill: "Slash command /session-end non installe",
    doctorSessionEndSkillOk: "Slash command /session-end installe",
    doctorAllGood: "Le vault est en bonne sante. Aucun probleme.",
    doctorIssues: "problemes trouves",
    doctorWarnings: "avertissements trouves",
    doctorRunSync: "Conseil: lancez 'mempunk sync' pour corriger les fichiers manquants.",

    warnCorruptConfig: "Attention: fichier de config corrompu a",
    errorWriteConfig: "Erreur: impossible d'ecrire la config:",
    errorSelectOne: "Selectionnez au moins un dossier",
    errorUnknownLang: "Langue inconnue:",
    availableLangs: "Disponibles:",

    structure: "Structure",

    cliAddSuccess: "CLI ajoute:",
    cliAlreadyActive: "CLI deja actif:",
    cliRemoveSuccess: "CLI supprime:",
    cliNotActive: "CLI non actif:",
    cliCannotRemoveLast: "Impossible de supprimer le dernier CLI actif.",
    cliListTitle: "CLIs actifs:",
    cliNameRequired: "Erreur: nom du CLI requis. Options: claude-code, opencode, gemini-cli",
    cliUnknown: "Erreur: CLI inconnu:",
    cliAvailable: "Disponibles:",
    cliNotInstalled: "Attention: {cli} ne semble pas etre installe.",
    cliLinkingAll: "Liaison a {count} CLIs...",
    cliUnlinkingAll: "Dissociation de {count} CLIs...",
    cliInstallingSkills: "Installation des skills pour {count} CLIs...",
    selectCLIs: "Quels CLIs d'IA allez-vous utiliser avec mempunk?",
    autoStartEnabled: "Auto-start active pour",
    autoStartDisabled: "Auto-start desactive pour",
    autoStartStatus: "Statut auto-start:",
    autoStartOn: "active",
    autoStartOff: "desactive",
    autoStartNotAvailable: "Auto-start n'est disponible que pour Claude Code et gemini-cli.",
    autoStartUsage: "Utilisation: mempunk auto-start [on|off]",
    autoStartSelectCLI: "Pour quel CLI configurer auto-start?",
  },
};

export function getTranslations(lang) {
  return translations[lang] || translations.en;
}

export function getAvailableLanguages() {
  return Object.keys(translations);
}
