import { parseArgs } from 'node:util';

// ── Parseo de argumentos ─────────────────────────────────────────────────────

const { values: opts, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    priority: { type: 'string' },   // backlog add, backlog update
    status:   { type: 'string' },   // backlog list, backlog update
    tags:     { type: 'string' },   // decision add
    file:     { type: 'string' },   // skill update
    project:  { type: 'string' },   // search, sync
    files:    { type: 'string' },   // session log
    url:      { type: 'string' },    // resource add
    content:  { type: 'string' },   // resource add, daily log
    global:       { type: 'boolean' },  // hooks install/uninstall (deprecated alias — global es el default)
    local:        { type: 'boolean' },  // hooks install/uninstall --local → instala en .claude/ del proyecto actual
    check:        { type: 'boolean' },  // hooks install --check
    yes:          { type: 'boolean' },  // remove --yes
    path:         { type: 'string'  },  // project add --path <dir> → ruta del repo real
    here:         { type: 'boolean' },  // project activate --here → mapear cwd al proyecto
    json:         { type: 'boolean' },  // comandos de lectura → salida JSON para scripts/agentes
    out:          { type: 'string'  },  // export --out <file>
    v:            { type: 'boolean' },  // -v
    version:      { type: 'boolean' },  // --version
    cli:          { type: 'string'  },  // link/unlink --cli <name>
    'setup-mode': { type: 'string'  },  // setup --setup-mode auto|manual|vault-skills
  },
  allowPositionals: true,
  strict: false, // ignorar opciones no declaradas sin lanzar error
});

// Estructura del comando: mempunk <command> <subcommand> <arg0> <arg1> …
const [command, subcommand, ...args] = positionals;

export { opts, positionals, command, subcommand, args };
