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
│       └── skills/           → stack, patrones y convenciones del proyecto
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
mempunk skill add <project_id> <name>                → crea un skill del proyecto
mempunk skill list <project_id>                      → lista skills del proyecto
mempunk skill update <id> --file <path>              → sobreescribe el markdown de un skill
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
mempunk session recover <project_id>                 → muestra el último snapshot disponible (checkpoint o compact)
mempunk session checkpoints <project_id>             → lista todos los checkpoints y compact_snapshots del proyecto
mempunk hooks install                                → instala hooks + agentes en ~/.claude/ (global, todos los proyectos)
mempunk hooks install --local                        → instala hooks + agentes en .claude/ del proyecto actual
mempunk hooks install --check                        → verifica hooks, agentes y statusline instalados
mempunk hooks uninstall                              → elimina hooks, agentes y statusline de Mempunk (global; --local para el proyecto actual)
```

---

## Agentes disponibles

Si los agentes están instalados (`mempunk hooks install`), úsalos en vez de los protocolos manuales:

- **`@mempunk-loader`** — carga el contexto del proyecto al inicio de sesión (reemplaza el protocolo manual)
- **`@mempunk-saver`** — guarda decisiones, session logs y actualizaciones al vault en background
- **`@mempunk-recover`** — recupera contexto de una sesión cerrada manualmente (complementa el hook automático)

El agente saver se activa automáticamente cuando detectas una decisión técnica o tarea completada.
Para guardado explícito: `SAVE decision: project=<id> title="<decisión>"` o `SAVE session: project=<id> summary="<resumen>"`.

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

El session-end es una compilación de lo que ya se guardó, no el único momento de guardado.

---

## Cuándo usar mempunk sync

Solo cuando sospeches inconsistencia entre archivos en disco y la base de datos. No ejecutar en cada sesión.

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

Versión actual del vault: 4
Versión mínima requerida por este CLI: 2

Si el vault está desactualizado, los comandos abortan con un mensaje claro en vez de migrar en silencio. Ejecuta `mempunk vault upgrade` para actualizarlo.
