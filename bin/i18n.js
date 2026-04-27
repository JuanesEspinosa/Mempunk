const translations = {
  en: {
    help: `
  mempunk — Persistent dev brain for Claude Code

  Usage:
    mempunk setup                  Interactive full setup (recommended)
    mempunk init [path] [options]  Create a new vault
    mempunk project <name>         Add a new project to the vault
    mempunk remove <name>          Remove a project from the vault
    mempunk sync                   Add missing template files to existing projects
    mempunk log <name>             Open a project's session log
    mempunk backlog <name>         Show a project's backlog
    mempunk link <path>            Link vault to Claude Code (global config)
    mempunk unlink                 Remove vault from Claude Code config
    mempunk status                 Show current linked vault
    mempunk help                   Show this message

  Options:
    --lang <code>      Language: en, es, pt (default: en)
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
    linkExisting: "Link it to Claude Code?",
    selectStructure: "Select vault structure",
    selectFolders: "Select folders to include",
    linkQuestion: "Link vault to Claude Code?",
    done: "Run 'claude' in any project to start using your vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — projects only",
    presetCustom: "Custom — pick folders",

    folderProjects: "projects  — One dir per active project",
    folderAreas: "areas     — Ongoing responsibilities",
    folderResources: "resources — Reusable technical knowledge",
    folderDaily: "daily     — Session logs written by Claude",

    creatingVault: "Creating vault...",
    linkingVault: "Linking to Claude Code...",
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
    linkSuccess: "Claude Code will have access to the vault in every session.",

    noVaultLinked: "No vault linked.",
    vaultUnlinked: "Vault unlinked from Claude Code.",

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

    promptTitle: "Type this in any Claude Code session:",
    promptAlt: "Or paste: Read the CLAUDE.md at \"{path}\" and follow the session start protocol.",

    installingSkill: "Installing /mempunk and /session-end commands...",
    skillInstalled: "/mempunk and /session-end installed globally",

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

    warnCorruptConfig: "Warning: corrupted config file at",
    errorWriteConfig: "Error: failed to write config:",
    errorSelectOne: "Select at least one folder",
    errorUnknownLang: "Unknown language:",
    availableLangs: "Available:",

    structure: "Structure",
  },

  es: {
    help: `
  mempunk — Cerebro persistente para Claude Code

  Uso:
    mempunk setup                  Setup interactivo completo (recomendado)
    mempunk init [ruta] [opciones] Crear un nuevo vault
    mempunk project <nombre>       Agregar un nuevo proyecto al vault
    mempunk remove <nombre>        Eliminar un proyecto del vault
    mempunk sync                   Agregar archivos faltantes a proyectos existentes
    mempunk log <nombre>           Abrir el session log de un proyecto
    mempunk backlog <nombre>       Ver el backlog de un proyecto
    mempunk link <ruta>            Vincular vault a Claude Code (config global)
    mempunk unlink                 Desvincular vault de Claude Code
    mempunk status                 Mostrar vault vinculado actual
    mempunk help                   Mostrar este mensaje

  Opciones:
    --lang <codigo>    Idioma: en, es, pt (por defecto: en)
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
    linkExisting: "Vincularlo a Claude Code?",
    selectStructure: "Selecciona la estructura del vault",
    selectFolders: "Selecciona las carpetas a incluir",
    linkQuestion: "Vincular vault a Claude Code?",
    done: "Ejecuta 'claude' en cualquier proyecto para usar tu vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — solo projects",
    presetCustom: "Custom — elegir carpetas",

    folderProjects: "projects  — Un dir por proyecto activo",
    folderAreas: "areas     — Responsabilidades continuas",
    folderResources: "resources — Conocimiento tecnico reutilizable",
    folderDaily: "daily     — Logs de sesion por Claude",

    creatingVault: "Creando vault...",
    linkingVault: "Vinculando a Claude Code...",
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
    linkSuccess: "Claude Code tendra acceso al vault en cada sesion.",

    noVaultLinked: "No hay vault vinculado.",
    vaultUnlinked: "Vault desvinculado de Claude Code.",

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

    promptTitle: "Escribe esto en cualquier sesion de Claude Code:",
    promptAlt: "O pega: Lee el CLAUDE.md en \"{path}\" y sigue el protocolo de inicio de sesion.",

    installingSkill: "Instalando /mempunk y /session-end...",
    skillInstalled: "/mempunk y /session-end instalados globalmente",

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

    warnCorruptConfig: "Advertencia: archivo de config corrupto en",
    errorWriteConfig: "Error: no se pudo escribir la config:",
    errorSelectOne: "Selecciona al menos una carpeta",
    errorUnknownLang: "Idioma desconocido:",
    availableLangs: "Disponibles:",

    structure: "Estructura",
  },

  pt: {
    help: `
  mempunk — Cérebro persistente para Claude Code

  Uso:
    mempunk setup                  Setup interativo completo (recomendado)
    mempunk init [caminho] [opções] Criar um novo vault
    mempunk project <nome>         Adicionar um novo projeto ao vault
    mempunk remove <nome>          Remover um projeto do vault
    mempunk sync                   Adicionar arquivos faltantes a projetos existentes
    mempunk log <nome>             Abrir o session log de um projeto
    mempunk backlog <nome>         Ver o backlog de um projeto
    mempunk link <caminho>         Vincular vault ao Claude Code (config global)
    mempunk unlink                 Desvincular vault do Claude Code
    mempunk status                 Mostrar vault vinculado atual
    mempunk help                   Mostrar esta mensagem

  Opções:
    --lang <código>    Idioma: en, es, pt (padrão: en)
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
    linkExisting: "Vincular ao Claude Code?",
    selectStructure: "Selecione a estrutura do vault",
    selectFolders: "Selecione as pastas a incluir",
    linkQuestion: "Vincular vault ao Claude Code?",
    done: "Execute 'claude' em qualquer projeto para usar seu vault.",

    presetFull: "Full — projects, areas, resources, daily",
    presetStandard: "Standard — projects, resources, daily",
    presetMinimal: "Minimal — apenas projects",
    presetCustom: "Custom — escolher pastas",

    folderProjects: "projects  — Um dir por projeto ativo",
    folderAreas: "areas     — Responsabilidades contínuas",
    folderResources: "resources — Conhecimento técnico reutilizável",
    folderDaily: "daily     — Logs de sessão pelo Claude",

    creatingVault: "Criando vault...",
    linkingVault: "Vinculando ao Claude Code...",
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
    linkSuccess: "Claude Code terá acesso ao vault em cada sessão.",

    noVaultLinked: "Nenhum vault vinculado.",
    vaultUnlinked: "Vault desvinculado do Claude Code.",

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

    promptTitle: "Digite isso em qualquer sessão do Claude Code:",
    promptAlt: "Ou cole: Leia o CLAUDE.md em \"{path}\" e siga o protocolo de início de sessão.",

    installingSkill: "Instalando /mempunk e /session-end...",
    skillInstalled: "/mempunk e /session-end instalados globalmente",

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

    warnCorruptConfig: "Aviso: arquivo de config corrompido em",
    errorWriteConfig: "Erro: falha ao escrever a config:",
    errorSelectOne: "Selecione pelo menos uma pasta",
    errorUnknownLang: "Idioma desconhecido:",
    availableLangs: "Disponíveis:",

    structure: "Estrutura",
  },
};

export function getTranslations(lang) {
  return translations[lang] || translations.en;
}

export function getAvailableLanguages() {
  return Object.keys(translations);
}
