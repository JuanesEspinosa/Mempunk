const translations = {
  en: {
    help: `
  mempunk — Persistent dev brain for Claude Code

  Usage:
    mempunk setup                  Interactive full setup (recommended)
    mempunk init [path] [options]  Create a new vault
    mempunk project <name>         Add a new project to the vault
    mempunk log <name>             Open a project's session log
    mempunk backlog <name>         Show a project's backlog
    mempunk link <path>            Link vault to Claude Code (global config)
    mempunk unlink                 Remove vault from Claude Code config
    mempunk status                 Show current linked vault
    mempunk help                   Show this message

  Options:
    --lang <code>      Language: en, es (default: en)
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
    mempunk log <nombre>           Abrir el session log de un proyecto
    mempunk backlog <nombre>       Ver el backlog de un proyecto
    mempunk link <ruta>            Vincular vault a Claude Code (config global)
    mempunk unlink                 Desvincular vault de Claude Code
    mempunk status                 Mostrar vault vinculado actual
    mempunk help                   Mostrar este mensaje

  Opciones:
    --lang <codigo>    Idioma: en, es (por defecto: en)
    --preset <nombre>  Preset: full, standard, minimal
    --projects         Incluir carpeta projects
    --areas            Incluir carpeta areas
    --resources        Incluir carpeta resources
    --daily            Incluir carpeta daily

  Ejemplos:
    mempunk setup
    mempunk setup --lang es
    mempunk init ./mi-vault --preset full
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

    warnCorruptConfig: "Advertencia: archivo de config corrupto en",
    errorWriteConfig: "Error: no se pudo escribir la config:",
    errorSelectOne: "Selecciona al menos una carpeta",
    errorUnknownLang: "Idioma desconocido:",
    availableLangs: "Disponibles:",

    structure: "Estructura",
  },
};

export function getTranslations(lang) {
  return translations[lang] || translations.en;
}

export function getAvailableLanguages() {
  return Object.keys(translations);
}
