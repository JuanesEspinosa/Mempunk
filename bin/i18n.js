const translations = {
  en: {
    // ── Help ──
    help: `
  mempunk — Persistent dev brain for Claude Code

  Usage:
    mempunk setup                  Interactive full setup (recommended)
    mempunk init [path] [options]  Create a new vault
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
    mempunk init ./my-vault --projects --resources
    mempunk link ./my-vault
`,

    // ── Setup ──
    setupTitle: "mempunk — vault setup",
    selectLanguage: "Select language",
    langEnglish: "English",
    langSpanish: "Espanol",
    whereVault: "Where do you want your vault?",
    vaultAlreadyExists: "Vault already exists at",
    linkExisting: "Link it to Claude Code?",
    selectStructure: "Select vault structure:",
    presetFull: "Everything — projects, areas, resources, daily",
    presetStandard: "Projects + resources + daily logs",
    presetMinimal: "Projects only",
    presetCustom: "pick folders",
    selectFolders: "Select folders to include:",
    enterNumbers: "Enter numbers separated by commas (e.g. 1,3,4)",
    linkQuestion: "Link vault to Claude Code?",
    choose: "Choose (number)",
    select: "Select",
    done: "Done. Run 'claude' in any project to start using your vault.",

    // ── Folders ──
    folderProjects: "One directory per active project with overview, backlog, and session logs",
    folderAreas: "Ongoing responsibilities (university, infrastructure, etc.)",
    folderResources: "Reusable technical knowledge across projects",
    folderDaily: "Daily session logs written by Claude",

    // ── Init ──
    vaultCreated: "Vault created at",
    errorVaultExists: "Error: vault already exists at",
    errorUnknownPreset: "Error: unknown preset",
    usePresets: "Use: full, standard, minimal",

    // ── Link ──
    errorPathRequired: "Error: path required",
    usageLink: "Usage: mempunk link <path>",
    errorPathNotExist: "Error: path does not exist:",
    errorNoClaude: "Error: no CLAUDE.md found at",
    runInitFirst: "Run 'mempunk init' first to create a vault.",
    alreadyLinked: "Already linked:",
    vaultLinked: "Vault linked:",
    linkSuccess: "Claude Code will have access to the vault in every session.",

    // ── Unlink ──
    noVaultLinked: "No vault linked.",
    vaultUnlinked: "Vault unlinked from Claude Code.",

    // ── Status ──
    linkedVaults: "Linked vaults:",
    notFound: "(not found)",
    noVaultSetup: "No vault linked. Run 'mempunk setup' to get started.",
  },

  es: {
    // ── Help ──
    help: `
  mempunk — Cerebro persistente para Claude Code

  Uso:
    mempunk setup                  Setup interactivo completo (recomendado)
    mempunk init [ruta] [opciones] Crear un nuevo vault
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
    mempunk init ./mi-vault --projects --resources
    mempunk link ./mi-vault
`,

    // ── Setup ──
    setupTitle: "mempunk — configuracion del vault",
    selectLanguage: "Selecciona idioma",
    langEnglish: "English",
    langSpanish: "Espanol",
    whereVault: "Donde quieres crear tu vault?",
    vaultAlreadyExists: "Ya existe un vault en",
    linkExisting: "Vincularlo a Claude Code?",
    selectStructure: "Selecciona la estructura del vault:",
    presetFull: "Todo — projects, areas, resources, daily",
    presetStandard: "Projects + resources + logs diarios",
    presetMinimal: "Solo projects",
    presetCustom: "elegir carpetas",
    selectFolders: "Selecciona las carpetas a incluir:",
    enterNumbers: "Escribe los numeros separados por comas (ej. 1,3,4)",
    linkQuestion: "Vincular vault a Claude Code?",
    choose: "Elige (numero)",
    select: "Selecciona",
    done: "Listo. Ejecuta 'claude' en cualquier proyecto para usar tu vault.",

    // ── Folders ──
    folderProjects: "Un directorio por proyecto activo con overview, backlog y session logs",
    folderAreas: "Responsabilidades continuas (universidad, infraestructura, etc.)",
    folderResources: "Conocimiento tecnico reutilizable entre proyectos",
    folderDaily: "Logs de sesion diarios escritos por Claude",

    // ── Init ──
    vaultCreated: "Vault creado en",
    errorVaultExists: "Error: ya existe un vault en",
    errorUnknownPreset: "Error: preset desconocido",
    usePresets: "Usa: full, standard, minimal",

    // ── Link ──
    errorPathRequired: "Error: ruta requerida",
    usageLink: "Uso: mempunk link <ruta>",
    errorPathNotExist: "Error: la ruta no existe:",
    errorNoClaude: "Error: no se encontro CLAUDE.md en",
    runInitFirst: "Ejecuta 'mempunk init' primero para crear un vault.",
    alreadyLinked: "Ya vinculado:",
    vaultLinked: "Vault vinculado:",
    linkSuccess: "Claude Code tendra acceso al vault en cada sesion.",

    // ── Unlink ──
    noVaultLinked: "No hay vault vinculado.",
    vaultUnlinked: "Vault desvinculado de Claude Code.",

    // ── Status ──
    linkedVaults: "Vaults vinculados:",
    notFound: "(no encontrado)",
    noVaultSetup: "No hay vault vinculado. Ejecuta 'mempunk setup' para comenzar.",
  },
};

function getTranslations(lang) {
  return translations[lang] || translations.en;
}

function getAvailableLanguages() {
  return Object.keys(translations);
}

module.exports = { getTranslations, getAvailableLanguages };
