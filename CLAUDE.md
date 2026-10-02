# Mempunk

## Qué es Mempunk

CLI tool que da memoria persistente entre sesiones de Claude Code via SQLite + markdown.

---

## Estructura del vault

```
~/Dev-Brain/
├── projects/
│   └── <id>/
│       ├── INDEX.md          → metadatos del proyecto (nombre, fecha, status)
│       ├── decisions/        → ADRs del proyecto
│       ├── skills/<name>/SKILL.md → skills de Claude Code del proyecto
│       ├── agents/<name>.md  → subagentes del proyecto
│       └── mempunk.json      → {"profiles": [...]} perfiles aplicados
├── global/{skills,agents}/   → skills/agentes para todos los proyectos (→ ~/.claude/)
├── profiles/<p>/{skills,agents}/ → compartidos por stack (nestjs, nextjs…)
├── areas/                    → contexto de áreas de trabajo (no proyectos)
├── resources/                → links y referencias capturadas
├── daily/                    → logs diarios narrativos
└── .mempunk/
    └── mempunk.db            → base de datos SQLite, no tocar manualmente
```

---

## Comandos disponibles

```
mempunk init                                         → crea ~/Dev-Brain/ con la estructura base
mempunk project add <id> <name>                      → registra un proyecto nuevo (mapea el cwd como repo del proyecto)
mempunk project add <id> <name> --path <dir>         → igual, indicando la ruta del repo explícitamente
mempunk project list                                 → lista todos los proyectos
mempunk project activate <id>                        → marca el proyecto activo global (fallback de los hooks)
mempunk project activate <id> --here                 → además mapea el directorio actual al proyecto (resolución por cwd)
mempunk backlog add <project_id> "<title>"           → agrega tarea al backlog
mempunk backlog list <project_id>                    → lista tareas del proyecto
mempunk backlog list <project_id> --status <valor>   → lista tareas filtradas por status
mempunk backlog update <id> --status <valor>         → actualiza status de una tarea
mempunk backlog update <id> --priority <valor>       → actualiza prioridad de una tarea
mempunk decision add <project_id> "<title>"          → crea una decisión (ADR) con archivo markdown
mempunk decision add <project_id> "<title>" --tags "t1,t2"  → igual con etiquetas
mempunk decision list <project_id>                   → lista decisiones del proyecto
mempunk skill add <name> --global|--profile <p>|--project <id> --description "..."  → crea skills/<name>/SKILL.md en ese scope (description obligatoria: Claude la usa para activarla)
mempunk skill add <project_id> <name> --description "..."  → forma heredada = --project
mempunk skill list <project_id> [--json]             → skills disponibles para el proyecto (globales + perfiles + proyecto, resueltas; id = <scope>:<owner>:<name>)
mempunk skill list --global | --profile <p>          → skills de un scope
mempunk skill update <id> --file <path>              → reemplaza el contenido (id de list o id heredado); si el archivo no trae frontmatter se conserva el actual
mempunk agent add|list|update ...                    → igual que skill, para subagentes (agents/<name>.md)
mempunk profile list                                 → perfiles existentes con conteo de skills/agentes
mempunk project profile <id> [--add <p>] [--remove <p>]  → perfiles aplicados al proyecto (orden = precedencia; el proyecto gana)
mempunk materialize [--global | --project <id>] [--dry-run] [--json]  → copia skills/agentes del vault a ~/.claude/ (global) y a <repo>/.claude/ (perfil+proyecto, privado vía .git/info/exclude). Lo ejecuta on-start.js en cada sesión; nunca pisa copias editadas a mano (conflicto)
mempunk resource add <project_id> "<title>" --url <url>  → captura un resource externo con url y contenido
mempunk resource add <project_id> "<title>" --url <url> --content "<texto>"  → igual con contenido
mempunk resource list <project_id>                   → lista resources del proyecto
mempunk daily log <project_id> "<content>"           → agrega una entrada al log diario
mempunk daily list <project_id>                      → lista los logs diarios del proyecto
mempunk session log <project_id> "<summary>"         → registra sesión de trabajo
mempunk session log <project_id> "<summary>" --files "p1,p2"  → igual con archivos tocados
mempunk session last <project_id>                    → muestra la última sesión registrada
mempunk search "<query>"                             → búsqueda full-text en el vault
mempunk search "<query>" --project <project_id>      → búsqueda limitada a un proyecto
mempunk sync                                         → verifica consistencia vault ↔ BD
mempunk sync --project <project_id>                  → sync limitado a un proyecto
mempunk remote set <url> [--branch <rama>] [--auto]  → registra el repo git destino del vault (git init + origin si hace falta); sin --branch usa la rama activa de ~/Dev-Brain (o main); rechaza URLs con credenciales embebidas; --auto activa pull al inicio y push al cierre de sesión
mempunk remote show [--json]                         → muestra url (enmascarada), rama, automatización y último push/pull
mempunk remote unset                                 → elimina .mempunk/remote.json (no toca .git)
mempunk push [--message-file <path> | --message-stdin | -m "<msg>"] [--project <id>] [--strict] → checkpoint WAL de la BD, commit de los cambios locales, fetch + merge de origin/<rama>, integrity check y push
mempunk pull                                         → backup verificado, commit de los cambios locales, fetch + merge de origin/<rama>, integrity check de la BD, re-mapeo de rutas de esta máquina
mempunk session recover <project_id>                 → muestra el último snapshot disponible (checkpoint o compact)
mempunk session checkpoints <project_id>             → lista todos los checkpoints y compact_snapshots del proyecto
mempunk vault backup                                 → copia verificada de mempunk.db en .mempunk/backups/ (retiene 10)
mempunk export [--out <file>]                        → dump JSON portable de todas las tablas del vault
mempunk <comando de lectura> --json                  → salida JSON parseable (list, session last/checkpoints, search)
mempunk hooks install                                → instala hooks + agentes en ~/.claude/ (global, todos los proyectos)
mempunk hooks install --local                        → instala hooks + agentes en .claude/ del proyecto actual
mempunk hooks install --check                        → verifica hooks, agentes y statusline instalados
mempunk hooks uninstall                              → elimina hooks, agentes y statusline de Mempunk (global; --local para el proyecto actual)
```

---

## Agentes disponibles

Si los agentes están instalados (`mempunk hooks install`), úsalos en vez de los protocolos manuales:

- **`@mempunk-loader`** — carga el contexto del proyecto al inicio de sesión (reemplaza el protocolo manual). Regla de precedencia: si el contexto ya fue cargado en la sesión (p.ej. via un skill /mempunk o el auto-start), el loader NO re-carga — solo confirma el proyecto activo.
- **`@mempunk-saver`** — guarda decisiones, session logs y actualizaciones al vault en background
- **`@mempunk-recover`** — recupera contexto de una sesión cerrada manualmente (complementa el hook automático)
- **`@mempunk-syncer`** — sube (push) o baja (pull) el vault a su remote git en background. Úsalo al cerrar sesión o cuando el usuario diga que trabajó en otra máquina. Solo ejecuta `mempunk push` / `mempunk pull`; nunca toca git directamente ni crea el remote. El resumen lo pasa por stdin (`mempunk push --project <id> --message-stdin <<'MEMPUNK_EOF' … MEMPUNK_EOF`), nunca en la línea de comandos, y nunca reenvía el stderr de git.

El agente saver se activa automáticamente cuando detectas una decisión técnica o tarea completada.
Para guardado explícito: `SAVE decision: project=<id> title="<decisión>"` o `SAVE session: project=<id> summary="<resumen>"`.
Para sincronizar: `SYNC push: project=<id> summary="<resumen>"` o `SYNC pull:`. Si no hay remote configurado, el syncer responde `MEMPUNK-SYNCER: no remote configured — run: mempunk remote set <url>` — díselo al usuario, no lo configures tú. Si el comando falla responde `MEMPUNK-SYNCER ERROR: mempunk push failed (exit N) — run it manually in the terminal to see details` — pide al usuario que lo ejecute en la terminal.

---

## Protocolo de inicio de sesión (sin agentes)

Si los agentes no están instalados, ejecuta estos pasos en orden:

1. `mempunk session last <project_id>` → saber qué hizo la sesión anterior
2. `mempunk skill list <project_id>` → ver qué skills existen y cargar los relevantes leyendo sus `file_path`
3. `mempunk backlog list <project_id> --status pending` → ver tareas pendientes
4. **NO** cargar `INDEX.md` completo — usar `mempunk search` si necesitas encontrar algo específico
5. Si no hay sesión anterior (proyecto nuevo), ejecutar `mempunk sync` para verificar estado inicial

---

## Protocolo de saves incrementales

Guarda durante la sesión sin esperar al cierre en estos eventos:

- **Decisión arquitectural tomada** → `mempunk decision add` inmediatamente
- **Bug importante resuelto** → `mempunk session log` con summary del fix
- **Tarea completada o iniciada** → `mempunk backlog update` inmediatamente
- **Skill del proyecto modificado** → `mempunk skill update` inmediatamente
- **Link o referencia relevante capturada** → `mempunk resource add` inmediatamente
- **Bloque de trabajo importante terminado** → `mempunk daily log` con resumen del bloque

Esto es obligatorio, no opcional. Si la sesión se interrumpe, el contexto importante ya debe estar persistido.

---

## Protocolo de cierre de sesión

Ejecuta en orden al terminar:

1. `mempunk backlog update` por cada tarea que cambió de estado en la sesión
2. `mempunk decision add` por cada decisión importante no guardada durante la sesión
3. `mempunk session log` con summary de lo que se hizo y los archivos tocados
4. Invocar `@mempunk-syncer` con `SYNC push: project=<id> summary="<resumen>"` si el vault tiene remote configurado (`mempunk remote show`)

El session-end es una compilación de lo que ya se guardó, no el único momento de guardado.

---

## Cuándo usar mempunk sync

Solo cuando sospeches inconsistencia entre archivos en disco y la base de datos. No ejecutar en cada sesión.
`mempunk sync` no sube nada a git: para eso están `mempunk push` / `mempunk pull`.

---

## Sincronización entre máquinas

- Máquina nueva: clonar el vault en `~/Dev-Brain` **antes** de ejecutar cualquier comando mempunk ahí. Si se hace `mempunk init` primero y luego `remote set`/`pull`, git falla con "unrelated histories" (el CLI avisa que hay que clonar).
- Una vez por máquina: `mempunk remote set <url> --auto` (sin `--branch` usa la rama activa de `~/Dev-Brain`, o `main`). Acepta URLs https/ssh/git/file, `git@host:ruta` y rutas locales; rechaza URLs con credenciales embebidas (usa el credential helper de git o claves SSH) y muestra la url siempre enmascarada. El remote debe ser un repo **privado**: la BD contiene snapshots de sesión con extractos de conversación. La configuración queda en `.mempunk/remote.json` y viaja con el vault; los timestamps de esta máquina en `.mempunk/remote-state.json` (gitignored).
- Al empezar: `mempunk pull` (con `--auto` lo hace el hook `on-start.js`). Hace backup, commitea los cambios locales (`vault: local changes before pull`), trae y fusiona la rama remota, verifica la BD y lista los proyectos sin ruta en esta máquina con el `mempunk project activate <id> --here` exacto.
- Al cerrar: `SYNC push: project=<id> summary="<resumen>"` via `@mempunk-syncer` (o `mempunk push -m "<resumen>" --project <id>`; para resúmenes largos, `--message-file <path>` o `--message-stdin`). Con `--auto`, `on-end.js` hace un push de respaldo al terminar la sesión. Los mensajes se sanean (sin caracteres de control, máx. 2000 caracteres) y `--project` solo admite letras, dígitos, `_`, `-` y `.`.
- Conflicto en `mempunk.db`: gana la BD con actividad más reciente; la perdedora queda en `.mempunk/backups/conflict-<stamp>-<ours|theirs>.db`. Si el conflicto es en markdown, el comando se detiene con la lista de archivos y el merge queda en curso: resolver a mano y `git add` + `git commit` en `~/Dev-Brain` (o `git merge --abort`). Mientras haya un merge en curso o exista `.git/index.lock`, `push`/`pull` se niegan a ejecutar. Tras cualquier merge se corre el integrity check de la BD.
- Git corre sin prompts (`GIT_TERMINAL_PROMPT=0`) y con timeout: si faltan credenciales falla rápido. Los hooks (`on-start.js` 45 s, `on-end.js` 60 s) solo pasan a Claude un mensaje fijo clasificado (network / auth / timeout / conflict); el detalle va a `.mempunk/hooks.log`.
- Vault v5: las rutas de repo viven en `project_paths` por máquina (hostname normalizado: minúsculas, sin `.local`/`.lan`; override con `MEMPUNK_HOST`, normalizado igual); `--here` solo mapea esta máquina. Vaults existentes requieren `mempunk vault upgrade`.

---

## Vault version

Mempunk versiona el vault independientemente del CLI.

Verificar versión:

```
mempunk vault version
```

Actualizar vault después de instalar una nueva versión de Mempunk:

```
mempunk vault upgrade
```

Versión actual del vault: 6 (rutas relativas al vault en la BD; un CLI viejo aborta ante un vault más nuevo pidiendo actualizar mempunk)
Versión mínima requerida por este CLI: 2

Si el vault está desactualizado, los comandos abortan con un mensaje claro en vez de migrar en silencio. Ejecuta `mempunk vault upgrade` para actualizarlo.
