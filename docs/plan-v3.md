# Mempunk v3 — Plan de mejoras e integración nativa con Claude Code

Fecha: 18 de octubre de 2026 · Repositorio analizado: [JuanesEspinosa/Mempunk](https://github.com/JuanesEspinosa/Mempunk), commit `7daed54` (v2.2.0)

> **Para Claude Code:** este archivo es la fuente de verdad del trabajo de v3. Trabaja **una fase por rama** (`v3/fase-N-<nombre>`), no amplíes el alcance más allá de la fase en curso, y antes de escribir código confirma que el diagnóstico de la fase sigue siendo cierto leyendo los archivos que menciona. Los hooks se editan en `src/hooks/` y se compilan con `npm run build`; nunca edites `dist/`. Un commit por subtarea, con `npm test` y `npm run lint` en verde. En cualquier prueba manual usa `MEMPUNK_VAULT` apuntando a un vault temporal, nunca a `~/Dev-Brain`.

## Resumen ejecutivo

Mempunk v3 mantiene el núcleo como paquete npm agnóstico y cambia cómo se conecta a cada CLI: un servidor MCP local compartido, un plugin oficial para Claude Code y hooks que dejan de depender del formato interno del transcript.

**Qué cambia**

- **Integración con Claude Code:** de `mempunk hooks install` editando `~/.claude/settings.json` a un plugin instalable con `/plugin install`.
- **Lectura y escritura del vault:** de subagentes (`mempunk-saver`, `mempunk-loader`) que arman comandos Bash a herramientas MCP tipadas (`mempunk mcp`).
- **Captura automática:** de releer el JSONL completo en cada turno a usar los campos que ya trae el payload de cada hook (`last_assistant_message`, `PostToolUse`, `prompt`).
- **Carga de contexto:** el hook SessionStart inyecta directamente el bloque de contexto compilado (`wiki/state.md` + backlog + decisiones), sin lanzar un subagente.

**Qué no cambia**

- El vault (`~/Dev-Brain`), SQLite, el sync por git y el CLI de terminal.
- El soporte para Gemini CLI y opencode: ganan el mismo servidor MCP.
- Los datos existentes: no hay migración de esquema obligatoria para v3.

**Orden recomendado:** Fase 0 (arreglos rápidos, 1–2 días) → Fase 1 (MCP) → Fase 2 (plugin) → Fase 3 (hooks) → Fase 4 (retiro de subagentes) → Fase 5 (memoria nativa y adaptadores). Cada fase se publica como una versión menor independiente.

## Diagnóstico del estado actual (v2.2.0)

La base técnica es sólida; los problemas están en la capa de integración, que reimplementa a mano lo que Claude Code ya ofrece de forma nativa.

**Fortalezas que hay que conservar**

- Tests en Ubuntu, Windows y macOS con Node 22 y 24, ESLint y gate de cobertura del 80%.
- Hooks bundleados autocontenidos con esbuild (`scripts/build-hooks.mjs`).
- Git no interactivo con timeouts y clasificación de errores (`classifyCliFailure`), que evita inyectar stderr de un remote en el contexto.
- Resolución de proyecto por cwd con prefijo más largo (`getProjectId`), que evita cruzar sesiones concurrentes.
- Versionado del vault con migraciones explícitas (`vault upgrade`).

**Problemas encontrados**

| # | Problema | Dónde | Impacto | Fase |
| --- | --- | --- | --- | --- |
| 1 | `vault-skills/` no está en `"files"`; `npm pack` no lo incluye y `_installVaultSkills()` sale en silencio | `package.json`, `src/commands/setup.js` | Modo Gemini/opencode instalado desde npm no recibe protocolos | 0 |
| 2 | Dos cálculos distintos del % de contexto: la statusline usa `context_window.used_percentage`, el hook usa ventanas fijas 200k/1M y umbral fijo 83.5% | `src/hooks/on-prompt.js`, `src/statusline.js` | Avisos incoherentes; se rompe con modelos o ventanas nuevas | 0 |
| 3 | La restauración tras compactar reinyecta 6 mensajes truncados a 200 caracteres en vez del estado compilado; corta en 8.000 caracteres (el límite actual es 10.000) | `src/hooks/on-start.js` | Duplica el resumen nativo y desaprovecha `wiki/state.md` | 0 |
| 4 | `on-end.js` configurado con timeout de 90 s; SessionEnd tiene un presupuesto de ~1,5 s ampliable hasta 60 s | `src/commands/hooks.js` | El push de cierre puede cortarse sin aviso | 0 |
| 5 | Contenido de un vault personal en la raíz del repo (`areas/universidad`, `areas/infraestructura`, `daily/`, `projects/`, `resources/`) | raíz | Mezcla producto y datos personales | 0 |
| 6 | El `CLAUDE.md` del repo describe el uso del vault, no cómo desarrollar Mempunk | `CLAUDE.md` | Claude, al trabajar en el repo, recibe órdenes de "guardar en el vault" | 0 |
| 7 | Instalación editando `settings.json` con ~150 líneas de dedupe, rutas legacy y quoting de Windows | `src/commands/hooks.js` | Fuente recurrente de bugs (commits `3e65be8`, `786e650`) | 2 |
| 8 | Tres hooks releen el transcript JSONL completo; `on-stop` lo hace en cada respuesta | `on-stop.js`, `on-prompt.js`, `on-compact.js` | Coste O(n) por turno; el formato es interno y cambia (commit `fe73367`) | 3 |
| 9 | `FILE_RE` detecta archivos por regex sobre el texto | `src/hooks-lib/common.js` | Falsos positivos: cualquier `algo.md` mencionado cuenta como tocado | 3 |
| 10 | SessionEnd no registra la sesión; depende de que el modelo haya llamado al saver | `src/hooks/on-end.js` | Sesiones cerradas sin resumen | 3 |
| 11 | Guardar pasa por un subagente Haiku en background que ejecuta Bash, con fallback `node ~/.mempunk/cli.js` y heredocs para evitar romper el quoting | `src/agents/mempunk-saver.md` | Cadena frágil, fallos silenciosos, permisos de Bash | 1, 4 |
| 12 | Cargar contexto lanza un subagente Sonnet de hasta 15 turnos que pregunta el proyecto aunque el cwd ya lo resolvió | `src/agents/mempunk-loader.md` | Lento y caro; no determinista | 4 |
| 13 | Sin coordinación con la auto memory nativa de Claude Code (`MEMORY.md` por repo) | — | Dos memorias que pueden contradecirse | 5 |

## Arquitectura objetivo

El núcleo npm concentra toda la lógica en `src/services`; el CLI y el servidor MCP son dos interfaces sobre ella, y cada CLI de IA solo aporta un adaptador fino.

```
   Claude Code              Gemini CLI              opencode
        │                        │                       │
        ▼                        └──────────┬────────────┘
┌──────────────────────┐        ┌───────────▼─────────────────────────┐
│ Plugin de Claude Code│        │ Configuración MCP por CLI           │
│ hooks/hooks.json     │        │ bloque mcpServers → mempunk mcp     │
│ skills /mempunk:*    │        │ vault-skills/ como respaldo         │
│ .mcp.json            │        └───────────┬─────────────────────────┘
└───┬──────────────┬───┘                    │
    │ hooks        │ MCP                    │ MCP
┌───▼──────────────▼────────────────────────▼─────────────────────────┐
│ Paquete npm mempunk — núcleo agnóstico                              │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐    │
│  │ CLI mempunk              │   │ mempunk mcp (stdio)          │    │
│  │ hooks y terminal         │   │ un proceso local por sesión  │    │
│  └────────────┬─────────────┘   └──────────────┬───────────────┘    │
│  ┌────────────▼────────────────────────────────▼───────────────┐    │
│  │ src/services — una sola implementación                      │    │
│  │ decisiones, sesiones, backlog, contexto, búsqueda           │    │
│  └────────────┬────────────────────────────────┬───────────────┘    │
│  ┌────────────▼─────────────┐   ┌──────────────▼───────────────┐    │
│  │ VaultStore + SQLite      │   │ Sync git                     │    │
│  └────────────┬─────────────┘   └──────────────┬───────────────┘    │
└───────────────┼────────────────────────────────┼────────────────────┘
       ┌────────▼──────────────┐        ┌────────▼───────────┐
       │ Vault ~/Dev-Brain     │        │ Remote git privado │
       │ markdown + mempunk.db │        │ otras máquinas     │
       └───────────────────────┘        └────────────────────┘
```

Claude Code usa los hooks del plugin (que llaman al CLI) y el MCP; Gemini y opencode usan solo el MCP. Nada vive en un servidor: todo corre en la máquina del usuario y el vault se sincroniza por git.

## Fase 0 — Arreglos rápidos (v2.3.0)

Seis cambios pequeños, sin dependencias nuevas ni cambios de arquitectura; se pueden hacer en 1–2 días y publicar enseguida.

**0.1 Empaquetar `vault-skills/`**

- Añadir `"vault-skills/"` a `"files"` en `package.json`.
- En `_installVaultSkills()`, si `srcDir` no existe, lanzar error (con mensaje i18n en `en` y `es`) en vez de `return` silencioso.
- Test nuevo: ejecutar `npm pack --dry-run --json` y comprobar que aparecen `vault-skills/*.md`, `src/agents/*.md`, `dist/hooks/*.js` y `templates/`.

**0.2 Una sola fuente para el % de contexto** — *simplificado (decisión del 18-10-2026)*

Alcance vigente: `on-prompt.js` deja de calcular el % (fuera `readline`, la lectura de `transcript_path`, `DEFAULT_WINDOW`, `EXTENDED_WINDOW`, el sufijo `[1m]` y los mensajes `context.warn`/`context.alert` con el 83.5% fijo). El % queda solo en la statusline, que ya usa `context_window.used_percentage`. Si tras la Fase 3 se demuestra que los avisos hacen falta, se reintroducen con el diseño de abajo.

Diseño aplazado (no se implementa en la Fase 0):

- `statusline.js` escribe `{session_id, used_percentage, context_window_size, updated_at}` en `.mempunk/context-state.json` (mapa por `session_id`, máximo 20 entradas, igual que `checkpoint-state.json`). Escritura atómica (archivo temporal + `rename`) y solo si el % cambió.
- La statusline **nunca crea el vault**: si `.mempunk/` no existe, no escribe nada. Y nunca falla: la barra se pinta siempre.
- `on-prompt.js` lee ese valor; si no existe o tiene más de 5 minutos, no avisa (en vez de recalcular). Deja de importar `readline` y de abrir `transcript_path`.
- Eliminar `DEFAULT_WINDOW`, `EXTENDED_WINDOW`, el sufijo `[1m]` y la mención fija a 83.5% en los mensajes (`HOOK_MESSAGES` en `src/hooks-lib/common.js`, ambos idiomas); los umbrales 70/80 quedan configurables por `MEMPUNK_CONTEXT_WARN` y `MEMPUNK_CONTEXT_ALERT`.
- Si el usuario no usa la statusline de Mempunk, los avisos quedan desactivados y `hooks install --check` lo indica.

**0.3 Restaurar el estado compilado tras compactar**

- Crear `src/services/context.js` (primer módulo de la capa de servicios de la Fase 1): funciones puras que reciben el store y la ruta del vault y devuelven datos, sin imprimir nada.
- Nuevo comando `mempunk context <project_id> [--json] [--max-chars N] [--with-snapshot]` que construye el bloque `MEMPUNK CONTEXT`, en este orden de prioridad: `wiki/state.md` (sin la sección "Historial de estados anteriores"; si todavía es la plantilla sin rellenar, se trata como inexistente), última sesión, backlog pendiente (máx. 8), decisiones recientes (máx. 5) y, con `--with-snapshot`, archivos, comandos y últimos mensajes del último snapshot. Si no cabe todo, se omiten secciones enteras por el final y el estado se trunca antes que perderse.
- `on-start.js` con `source === "compact"` inyecta ese bloque (`mempunk context <id> --with-snapshot`); si el CLI falla, cae al formato anterior basado solo en el snapshot.
- Subir `MAX_CONTEXT_CHARS` a 9.500 (margen bajo el límite de 10.000).
- Este comando se reutiliza en la Fase 1 (`get_context`) y en la Fase 4 (auto-start).

**0.4 Timeouts acordes al presupuesto de SessionEnd**

- `HOOK_TIMEOUT_SECONDS['on-end.js']` a 60 y el tope interno del push (`PUSH_TIMEOUT_MS` en `on-end.js`) a 50 s.
- Documentar en el README que el push de cierre es un respaldo y que el push principal debe hacerse antes (Fase 3 lo mueve fuera de SessionEnd).

**0.5 Limpiar la raíz del repo**

- Mover los README de `areas/`, `daily/`, `projects/` y `resources/` a `templates/vault/<carpeta>/README.md`; `mempunk init` los copia desde ahí, sin pisar un README que el usuario ya tenga.
- Quitar del repo los README de áreas personales (`areas/universidad`, `areas/infraestructura`).
- Añadir un test que falle si aparecen carpetas de vault en la raíz.

**0.6 Separar los dos CLAUDE.md**

- `CLAUDE.md` de la raíz: cómo desarrollar Mempunk (estructura de `src/`, `npm run build` antes de testear, que los hooks se editan en `src/hooks/` y nunca en `dist/`, que los hooks no pueden importar de `src/lib/`, i18n en `src/lib/i18n.js` y en `HOOK_MESSAGES`, migraciones de vault, aislamiento de tests con `MEMPUNK_VAULT`/`HOME`, convención de commits). Al final: "El plan de trabajo vigente está en `docs/plan-v3.md`. Trabaja una fase por rama."
- `templates/CLAUDE.md`: se mantiene como plantilla del CLAUDE.md del vault (orientada al usuario).

**0.7 `vault upgrade --help` no debe migrar** *(añadido el 18-10-2026, tarea pendiente del backlog)*

- `mempunk vault upgrade --help` (y `-h`) muestra la ayuda del subcomando y sale sin abrir la base para escribir.
- Test: con un vault en versión antigua, `vault upgrade --help` deja la versión igual.

**0.8 Auto-start determinista** *(adelantado desde 4.1 el 18-10-2026)*

- Con `auto-start.flag`, SessionStart resuelve el proyecto con `getProjectId(cwd)` y, si existe, inyecta `mempunk context <id>` (de 0.3) como `additionalContext`, en vez de "invoca @mempunk-loader".
- Si el cwd no está mapeado, inyecta una sola línea: "Este directorio no está vinculado a un proyecto de Mempunk; usa /mempunk para elegir o crear uno." (en la Fase 2 pasa a `/mempunk:load`).
- Si `mempunk context` falla, se mantiene el comportamiento anterior (invocar al loader).

**Notas de implementación (verificadas en el código)**

- `mempunk init` hoy solo crea carpetas vacías; nada usa las carpetas de vault de la raíz del repo. Por eso 0.5 obliga a que `init` copie los README de `templates/vault/`.
- Ningún comando copia `templates/CLAUDE.md` automáticamente: es solo una plantilla de referencia.
- Los tests de la statusline (`tests/hooks.test.js`, bloque `statusline.js`) hoy no pasan `MEMPUNK_VAULT`; tras 0.2 deben pasar un vault y un `HOME` temporales, o escribirán en el `~/Dev-Brain` real del desarrollador.
- Los tests de `on-prompt.js` construyen transcripts con `usage`; tras 0.2 deben escribir `context-state.json` directamente. Añadir casos: sin dato de statusline, dato viejo (> 5 min), umbrales por env, y que un transcript en el payload ya no se lee.
- `tests/hooks-remote.test.js` espera `timeout: 90` para SessionEnd; actualizar a 60.
- Tras 0.3, la restauración tras compactar inyecta contexto aunque no exista snapshot (basta con que el proyecto exista). El test actual de `on-start.js` sigue siendo válido; añadir uno con `wiki/state.md` relleno que compruebe que el estado, el backlog y los archivos del snapshot aparecen y que el total no supera 9.500 caracteres.
- `VaultStore` ya activa WAL (línea ~313) pero no `busy_timeout`; eso entra en la Fase 1.
- Añadir `context` a la ayuda del CLI en `src/lib/i18n.js` (ambos idiomas) y registrar las opciones `--max-chars` y `--with-snapshot` en `src/lib/args.js`.

**Criterio de salida de la fase:** `npm test` y `npm run lint` en verde en los tres sistemas operativos, `npm pack --dry-run` incluye `vault-skills/`, una sesión compactada muestra `wiki/state.md` en el contexto restaurado, `vault upgrade --help` no migra, una sesión nueva en un repo vinculado arranca con el bloque de contexto sin invocar a `@mempunk-loader`, y ningún hook de `src/hooks/` salvo `on-stop.js` y `on-compact.js` abre `transcript_path`.

## Fase 1 — Servidor MCP local: `mempunk mcp` (v2.4.0)

Un subcomando nuevo que habla MCP por stdio: cada CLI lo lanza como subproceso local al abrir la sesión, sin servidor, sin red y sin hosting.

**1.1 Extraer una capa de servicios**

Hoy la lógica de negocio está repartida entre `src/commands/*.js` (que también escriben archivos markdown e imprimen por consola) y `VaultStore` (solo SQLite). Por ejemplo, `addDecision(projectId, title, filePath, …)` espera que el comando ya haya creado el archivo del ADR. El servidor MCP no debe llamar al CLI por debajo ni duplicar esa lógica.

- Ampliar `src/services/` con funciones puras que reciben parámetros y devuelven objetos: `decisions.add()`, `sessions.log()`, `backlog.update()`, `context.build()` (ya creado en 0.3), `search.query()`.
- Los comandos del CLI pasan a ser envoltorios finos: parsean argumentos, llaman al servicio e imprimen.
- El MCP llama a los mismos servicios. Una sola implementación, dos interfaces.

**1.2 Herramientas iniciales**

| Herramienta | Parámetros | Devuelve | Sustituye a |
| --- | --- | --- | --- |
| `get_context` | `project_id?`, `max_chars?` | Bloque `MEMPUNK CONTEXT` | `mempunk-loader` |
| `save_decision` | `project_id?`, `title`, `context`, `decision`, `tags?` | id + ruta del ADR | `SAVE decision` del saver |
| `log_session` | `project_id?`, `summary`, `files?` | id de la sesión | `SAVE session` del saver |
| `backlog_list` | `project_id?`, `status?` | Tareas | `backlog list --json` |
| `backlog_update` | `id`, `status?`, `priority?` | Tarea actualizada | `backlog update` |
| `backlog_add` | `project_id?`, `title`, `priority?` | Tarea creada | `backlog add` |
| `search` | `query`, `project_id?`, `limit?` | Coincidencias FTS5 con ruta y fragmento | `mempunk search` |
| `update_state` | `project_id?`, `markdown` | Ruta de `wiki/state.md` | Paso 4 de `session-end.md` |

`project_id` es opcional en todas: si falta, se resuelve con `getProjectId(cwd)`. Si no hay proyecto, la herramienta devuelve un error explicativo (`isError: true`) que el modelo puede leer y corregir.

Push y pull **no** se exponen como herramientas en esta fase: tocan git y credenciales, y siguen siendo comandos de terminal o de hooks.

**1.3 Descripciones de herramientas**

La descripción de cada herramienta sustituye a buena parte del protocolo del CLAUDE.md, así que debe decir *cuándo* usarla, no solo qué hace. Ejemplo para `save_decision`: "Úsala en cuanto se acuerde una decisión técnica o de arquitectura (librería elegida, patrón, trade-off aceptado). No la uses para tareas ni para notas de progreso." Mantener cada descripción por debajo de ~300 caracteres.

**1.4 Implementación**

- Dependencias: `@modelcontextprotocol/sdk` y `zod` para los esquemas.
- Archivo `src/commands/mcp.js`: crea `McpServer`, registra las herramientas con `registerTool` y conecta `StdioServerTransport`.
- Registrar `mcp` en el despacho de `src/cli.js` como comando oculto de la ayuda principal (no es para uso manual).

**1.5 Reglas que no se pueden romper**

- **Nada a stdout** salvo el protocolo. Ni `console.log`, ni mensajes de i18n, ni avisos de migración. Redirigir todo a `console.error` o a `hooks.log`. Añadir un test que lance `mempunk mcp`, envíe `initialize` + `tools/list` y verifique que cada línea de stdout es JSON-RPC válido.
- **Concurrencia SQLite:** puede haber varias sesiones abiertas, cada una con su proceso MCP, más los hooks. WAL ya está activo en `VaultStore`; falta `this.db.pragma('busy_timeout = 5000')`. Las escrituras de varios pasos van en transacciones (`db.transaction`).
- **Vault desactualizado:** si `vault upgrade` es necesario, las herramientas devuelven un error claro; el servidor no migra en silencio.
- **Proceso de larga vida:** abrir la base una vez al iniciar y cerrarla en `SIGTERM`/`stdin end`. No cachear resultados de lectura: otra sesión puede haber escrito.

**1.6 Registro en cada CLI**

- Claude Code: lo declara el plugin en su `.mcp.json` (Fase 2). Mientras tanto, `claude mcp add --scope user mempunk -- mempunk mcp`.
- Gemini CLI: bloque `mcpServers` en `~/.gemini/settings.json` con `command: "mempunk"` y `args: ["mcp"]`.
- opencode: bloque equivalente en su configuración. Verificar el formato exacto en su documentación antes de que `mempunk setup` lo escriba.

**Criterio de salida:** desde Claude Code, Gemini y opencode se puede llamar a `get_context`, `save_decision` y `search` sobre el mismo vault; dos sesiones simultáneas guardando decisiones no producen `SQLITE_BUSY`.

## Fase 2 — Plugin de Claude Code (v2.5.0)

El plugin es un adaptador fino: declara hooks, agentes, skills y el servidor MCP, y todos ellos llaman al CLI `mempunk` instalado por npm. No contiene lógica de negocio ni la base de datos.

**2.1 Estructura en el repo**

```
plugin/
├── .claude-plugin/
│   └── plugin.json          name, version, description, author
├── hooks/
│   └── hooks.json           SessionStart, UserPromptSubmit, Stop, PreCompact, PostToolUse, SessionEnd
├── scripts/                 bundles de dist/hooks/ copiados en el build
├── agents/                  mempunk-recover.md, mempunk-syncer.md (los que sobreviven a la Fase 4)
├── skills/
│   ├── load/SKILL.md        /mempunk:load — cambiar o crear proyecto
│   └── end/SKILL.md         /mempunk:end — cierre de sesión guiado
└── .mcp.json                { "mcpServers": { "mempunk": { "command": "mempunk", "args": ["mcp"] } } }
.claude-plugin/
└── marketplace.json         en la raíz: el propio repo sirve de marketplace
```

**2.2 `hooks/hooks.json`**

- Cada comando usa `node "${CLAUDE_PLUGIN_ROOT}/scripts/on-start.js"`: sin rutas absolutas, sin quoting de Windows hecho a mano.
- Estado volátil de los hooks (`checkpoint-state.json`, `context-state.json`, `session-touched.json`) en `${CLAUDE_PLUGIN_DATA}`, que sobrevive a las actualizaciones del plugin. Los datos del vault siguen en `~/Dev-Brain`.
- Timeouts: SessionStart 60 s (pull automático), SessionEnd 60 s, el resto el valor por defecto.

**2.3 Comprobación del CLI**

El hook SessionStart verifica que `mempunk` está en el PATH y que su versión es compatible (`mempunk --version` ≥ la mínima que declara el plugin). Si no, inyecta un único aviso: "Mempunk plugin instalado pero falta el CLI: ejecuta `npm install -g mempunk`". Sin el CLI, el resto de hooks salen en silencio.

**2.4 Lo que el plugin no puede hacer**

- **Statusline:** un plugin no puede definir la statusline principal. Se mantiene un comando opcional `mempunk statusline install|uninstall` que edita solo la clave `statusLine` del settings.json del usuario. Es la única escritura que queda en ese archivo.
- **Permisos:** con MCP, la regla útil es permitir `mcp__plugin_mempunk_mempunk__*`. Documentarla en el README en vez de escribirla automáticamente.

**2.5 Instalación para el usuario**

1. `npm install -g mempunk`
2. En Claude Code: `/plugin marketplace add JuanesEspinosa/Mempunk` y `/plugin install mempunk@mempunk`.

`mempunk setup`, cuando el usuario elige Claude Code, puede ejecutar `claude plugin marketplace add` y `claude plugin install` por él e imprimir lo que hizo.

**2.6 Migración desde `hooks install`**

- v2.5.0: `mempunk hooks install` sigue funcionando pero imprime un aviso de obsolescencia y sugiere el plugin.
- Nuevo `mempunk hooks migrate`: elimina las entradas de Mempunk de `settings.json` (reutiliza `_unregisterHooksFromSettings`), borra los archivos de `~/.claude/hooks` y `~/.claude/agents` con el marcador `# mempunk-hook`/`# mempunk-agent`, y deja la statusline intacta.
- `hooks install --check` detecta si conviven plugin y hooks manuales (se ejecutarían dos veces) y lo reporta como error.
- v3.0.0: se retira `hooks install`.

**2.7 Validación**

- `claude plugin validate plugin/` en CI.
- El build (`npm run build`) copia `dist/hooks/*.js` a `plugin/scripts/` y sincroniza `version` de `plugin.json` con `package.json`; un test falla si difieren.

**Criterio de salida:** en una máquina limpia, `npm install -g mempunk` + `/plugin install` deja hooks, MCP y agentes funcionando sin tocar `settings.json`; `/plugin uninstall` no deja residuos.

## Fase 3 — Hooks sin parsear el transcript (v2.6.0)

Cada hook usa los campos de su propio payload y acumula estado incremental por sesión; ningún hook vuelve a abrir el JSONL. La documentación de Claude Code advierte que ese formato es interno y cambia entre versiones.

**3.1 Mapa de responsabilidades**

| Evento | Campo que usa | Hace | Reemplaza |
| --- | --- | --- | --- |
| `UserPromptSubmit` | `prompt`, `session_id` | Suma un turno real al contador de la sesión; lee `context-state.json` y avisa por umbral | Conteo de turnos y cálculo de % leyendo el JSONL |
| `PostToolUse` (matcher `Edit\|Write\|MultiEdit\|NotebookEdit`) | `tool_input.file_path` | Añade la ruta a `files_touched` de la sesión | `FILE_RE` sobre el texto |
| `PostToolUse` (matcher `Bash`) | `tool_input.command` | Añade el comando (truncado a 200) a `commands_run` | Extracción de `tool_use` en `on-compact` |
| `Stop` | `last_assistant_message` | Guarda el último mensaje; cada N turnos escribe un checkpoint con el estado acumulado | Lectura completa del JSONL en cada respuesta |
| `PreCompact` | `trigger` | Persiste el estado acumulado como `compact_snapshot` | Lectura completa del JSONL |
| `SessionStart` (`source: compact`) | `source`, `cwd` | Inyecta `mempunk context` (Fase 0.3) | Reinyección de mensajes crudos |
| `SessionEnd` | `reason` | Escribe un registro de sesión automático y lanza el push en segundo plano | Solo push síncrono |

**3.2 Estado acumulado por sesión**

- Un archivo por sesión en `${CLAUDE_PLUGIN_DATA}/sessions/<session_id>.json` (o `.mempunk/sessions/` sin plugin): `{project_id, turns, files_touched[], commands_run[], last_user_prompts[5], last_assistant_messages[5], updated_at}`.
- Escritura atómica (archivo temporal + `rename`) para que dos hooks seguidos no lo corrompan.
- Limpieza: borrar archivos de más de 7 días en cada SessionStart.
- Coste por hook: O(1) en vez de O(tamaño del transcript).

**3.3 Registro de sesión automático en SessionEnd**

Hoy, si el modelo no llamó al saver, la sesión queda sin resumen. Con el estado acumulado, SessionEnd puede escribir siempre un registro mínimo y determinista:

- `mempunk session log <id> --auto` con `summary` = primer prompt + último mensaje del asistente (truncados), `files` = `files_touched`, marcado como `auto: true`.
- Si en la sesión ya hubo un `log_session` explícito (vía MCP), no se duplica: el registro automático solo añade los archivos que falten.
- Debe terminar en < 1 s: es una inserción local en SQLite.
- `session last` y `get_context` prefieren el último registro no automático; el automático solo se usa si no hay otro más reciente.

**3.4 Push fuera del camino crítico**

SessionEnd tiene un presupuesto de ~1,5 s. El push no cabe ahí de forma fiable.

- SessionEnd lanza `mempunk push --background` desacoplado (`spawn` con `detached: true`, `stdio: 'ignore'`, `windowsHide: true` y `unref()`), y sale de inmediato. Probar a mano en Windows que el proceso sobrevive al cierre de Claude Code.
- El proceso en segundo plano usa un lockfile (`.mempunk/push.lock`) para que dos sesiones que cierran a la vez no hagan push simultáneo.
- El resultado va a `hooks.log`; el siguiente SessionStart informa si el último push falló.

**3.5 Compatibilidad y pruebas**

- Los tests de hooks pasan de usar transcripts JSONL de fixture a payloads JSON por evento, uno por archivo en `tests/fixtures/hooks/`.
- Mantener en `hooks-lib` una única función `readHookInput()` que valide los campos que cada hook necesita y registre en `hooks.log` si falta alguno (señal de que cambió el contrato).
- Verificar en la documentación de hooks los campos exactos de `SessionEnd` (`reason`) y `PreCompact` (`trigger`) antes de depender de ellos.

**Criterio de salida:** ningún archivo de `src/hooks/` importa `readline` ni abre `transcript_path`; una sesión de 300 turnos mantiene el tiempo del hook Stop por debajo de 50 ms; cerrar Claude Code sin guardar deja un registro de sesión con archivos tocados reales.

## Fase 4 — Contexto determinista y retiro de subagentes (v2.7.0)

Con el MCP y los hooks nuevos, `mempunk-saver` y `mempunk-loader` sobran: el contexto lo inyecta el hook y los guardados son llamadas directas a herramientas.

**4.1 Auto-start sin subagente** — *adelantado a la Fase 0 (0.8); aquí solo queda cambiar el aviso a `/mempunk:load`*

- Hoy: con `auto-start.flag`, SessionStart inyecta "invoca @mempunk-loader", y el loader (Sonnet, hasta 15 turnos) lista proyectos y pregunta cuál usar.
- Nuevo: SessionStart resuelve el proyecto con `getProjectId(cwd)` y, si existe, inyecta directamente `mempunk context <id>` como `additionalContext`.
- Si el cwd no está mapeado a ningún proyecto, inyecta una línea corta: "Este directorio no está vinculado a un proyecto de Mempunk; usa /mempunk:load para elegir o crear uno." No se pregunta nada por iniciativa propia.
- Resultado: contexto disponible desde el primer turno, sin coste de modelo y siempre igual para el mismo estado del vault.

**4.2 Skills en lugar de agentes**

| Hoy | v2.7 | Motivo |
| --- | --- | --- |
| `@mempunk-loader` | Skill `/mempunk:load` | Solo hace falta para cambiar o crear proyecto; con `get_context` cabe en un skill corto |
| `@mempunk-saver` | Se elimina | Sustituido por `save_decision`, `log_session`, `backlog_update` |
| `vault-skills/session-end.md` (Claude Code) | Skill `/mempunk:end` | Cierre guiado: revisar backlog, decisiones pendientes, `update_state`, push |
| `@mempunk-recover` | Se mantiene | Recuperación tras cierre manual; revisar si `get_context` + checkpoints lo cubren |
| `@mempunk-syncer` | Se mantiene | Push/pull toca git y credenciales; aislarlo en un agente sigue teniendo sentido |

En el frontmatter de los skills, usar `description` y `when_to_use` claros y `disable-model-invocation: true` en `/mempunk:end` si solo debe ejecutarse a petición del usuario.

**4.3 Adelgazar el CLAUDE.md del vault**

- `templates/CLAUDE.md` baja de 293 a menos de 60 líneas: qué es el vault, que existen las herramientas `mcp__…mempunk__*` y cuándo priorizarlas, y el enlace a `/mempunk:end`.
- Los protocolos largos (inicio, guardados incrementales, cierre) se quedan en `vault-skills/` para Gemini y opencode, y como referencia.
- Objetivo: menos contexto fijo por sesión y una sola fuente de verdad para "cuándo guardar" (las descripciones de las herramientas).

**4.4 `wiki/state.md` como pieza central**

El estado compilado es el diferencial de Mempunk y ahora alimenta tres caminos: auto-start, restauración tras compactar y `get_context`. Conviene:

- Plantilla fija con secciones (`Objetivo actual`, `Hecho`, `En curso`, `Siguiente`, `Decisiones vigentes`, `Riesgos`) para que el modelo la reescriba con forma estable.
- `update_state` valida que el markdown tenga esas secciones y que no supere ~4.000 caracteres; si no, devuelve error explicativo.
- Guardar la versión anterior en `wiki/log.md` (append) antes de sobrescribir.

**Criterio de salida:** una sesión nueva en un repo vinculado arranca con el bloque de contexto ya cargado sin ninguna llamada a subagente; `mempunk-saver.md` y `mempunk-loader.md` ya no se instalan.

## Fase 5 — Convivencia con la memoria nativa y otros CLIs (v2.8.0)

Claude Code ya trae auto memory activada por defecto: un `MEMORY.md` por repo en `~/.claude/projects/<proyecto>/memory/`, cuyas primeras 200 líneas (o 25 KB) se cargan en cada sesión. Mempunk debe complementarla, no competir con ella.

**5.1 Reparto de responsabilidades**

| Tipo de información | Dónde vive | Por qué |
| --- | --- | --- |
| Preferencias y notas sueltas ("usa pnpm", "tests con vitest") | Auto memory nativa | Claude ya la gestiona sola; duplicarla genera contradicciones |
| Decisiones de arquitectura (ADRs) | Mempunk `decisions/` | Necesitan fecha, contexto y búsqueda |
| Backlog y estado de tareas | Mempunk SQLite | Estructurado, con estados y prioridades |
| Estado compilado del proyecto | Mempunk `wiki/state.md` | Se reescribe por sesión; multi-CLI |
| Historial de sesiones y checkpoints | Mempunk SQLite | Recuperación y búsqueda |

Este reparto se explica en el README y en el CLAUDE.md del vault en dos líneas.

**5.2 Sincronizar la memoria nativa con el vault (opcional)**

- Comando `mempunk memory link <project_id>`: configura `autoMemoryDirectory` en el `.claude/settings.local.json` del repo apuntando a `~/Dev-Brain/projects/<id>/memory/`.
- Efecto: la memoria nativa viaja con `mempunk push/pull` entre máquinas sin trabajo extra.
- `mempunk context` puede incluir un resumen de esa carpeta si existe.
- Verificar en la documentación de memoria el nombre exacto de la clave y su ámbito antes de implementarlo.

**5.3 Memoria de subagentes**

Los subagentes que sobreviven (`mempunk-recover`, `mempunk-syncer`) no necesitan el campo `memory:`; su estado ya está en el vault. No añadirlo evita una tercera memoria.

**5.4 Gemini CLI y opencode**

- Ambos reciben el mismo servidor MCP de la Fase 1, que sustituye a la mayor parte de los pasos manuales de `vault-skills/`.
- `mempunk setup` escribe el bloque MCP en la configuración de cada CLI (con copia de seguridad del archivo y opción `--dry-run`).
- `vault-skills/` se reescribe para usar las herramientas MCP en vez de comandos Bash, y queda como protocolo de respaldo cuando el CLI no tiene MCP configurado.
- Si Gemini CLI u opencode ofrecen hooks o extensiones equivalentes, evaluarlos en una fase posterior; no bloquean v3.

**Criterio de salida:** el README documenta el reparto; `mempunk memory link` funciona en un repo de prueba y la memoria nativa aparece tras un `pull` en otra máquina; Gemini y opencode usan el MCP tras `mempunk setup`.

## Pruebas, CI y versionado

Cada fase sale como versión menor con su propio criterio de salida; v3.0.0 solo retira lo que ya estuvo marcado como obsoleto al menos una versión.

**Pruebas nuevas**

| Área | Prueba | Fase |
| --- | --- | --- |
| Empaquetado | `npm pack --dry-run --json` contiene `vault-skills/`, `dist/hooks/`, `templates/` (y `plugin/` desde la Fase 2) | 0 |
| Repo | No existen carpetas de vault en la raíz | 0 |
| Contexto | `mempunk context` con plantilla, con `state.md` relleno, `--json`, `--max-chars` y errores | 0 |
| MCP | `initialize` + `tools/list` + una llamada por herramienta; stdout solo JSON-RPC | 1 |
| MCP | Dos procesos escribiendo a la vez sin `SQLITE_BUSY` | 1 |
| Servicios | CLI y MCP producen el mismo resultado para la misma entrada | 1 |
| Plugin | `claude plugin validate plugin/` sin errores | 2 |
| Plugin | `version` de `plugin.json` = `version` de `package.json` | 2 |
| Hooks | Fixtures de payload por evento; ningún hook abre `transcript_path` | 3 |
| Hooks | Stop < 50 ms con un estado de sesión de 300 turnos | 3 |
| Comportamiento | `claude plugin eval` con casos: "se toma una decisión" → llama a `save_decision`; "terminamos por hoy" → sugiere `/mempunk:end` | 4 |

**CI**

- Mantener la matriz actual (Ubuntu, Windows, macOS × Node 22, 24) y el gate de cobertura del 80%, ampliando `--include` a `src/services/**`.
- Job nuevo `plugin`: build, `claude plugin validate` y comprobación de versión. Si el CLI de Claude Code no está disponible en el runner, dejar el job como manual hasta que lo esté.
- `claude plugin eval` en un workflow aparte, manual o nocturno: consume tokens y no debe bloquear cada PR.

**Versionado y compatibilidad**

| Versión | Contenido | Obsoleto |
| --- | --- | --- |
| 2.3.0 | Fase 0 | — |
| 2.4.0 | Fase 1: `mempunk mcp`, capa de servicios | — |
| 2.5.0 | Fase 2: plugin, `hooks migrate` | `hooks install` |
| 2.6.0 | Fase 3: hooks incrementales, registro automático | Lectura de transcript |
| 2.7.0 | Fase 4: skills, auto-start determinista | `mempunk-saver`, `mempunk-loader` |
| 2.8.0 | Fase 5: `memory link`, MCP en Gemini/opencode | — |
| 3.0.0 | Retiro de lo obsoleto; CLAUDE.md corto por defecto | — |

- El esquema del vault no cambia en v3; si una fase necesita columnas nuevas (por ejemplo `session_log.auto`), va como migración v7 con `vault upgrade` explícito, como hasta ahora.
- CHANGELOG por versión con una sección "Migración" cuando el usuario tenga que hacer algo.

## Cómo ejecutarlo con Claude Code

Una rama y un PR por fase, con este documento guardado en el repo como `docs/plan-v3.md`.

**Preparación (una vez)**

1. Guardar este archivo en `docs/plan-v3.md`.
2. Hacer primero el punto 0.6 (CLAUDE.md de desarrollo), porque es lo que Claude Code leerá en cada sesión del repo.
3. Mientras se desarrolla, usar `MEMPUNK_VAULT` apuntando a un vault de pruebas para que los hooks de Mempunk ya instalados no escriban en el vault real.

**Flujo por fase**

1. `git checkout -b v3/fase-N-<nombre>` desde `master` (o `develop`).
2. En Claude Code, entrar en modo plan y pedir el plan de la fase (prompt abajo). Revisar y ajustar antes de aprobar.
3. Implementar por subtareas (0.1, 0.2…), un commit por subtarea, con `npm test` y `npm run lint` en verde antes de cada commit.
4. Al terminar, pedir una revisión con un subagente que no haya visto la implementación, contra el criterio de salida de la fase.
5. PR, CHANGELOG actualizado, versión menor publicada tras el merge.

**Prompt de arranque por fase**

```
Lee docs/plan-v3.md, sección "Fase N". Antes de escribir código:
1. Lee los archivos que esa sección menciona y confirma que la descripción
   del estado actual sigue siendo cierta; si algo cambió, dímelo.
2. Propón un plan por subtareas con los archivos a tocar y los tests nuevos.
No amplíes el alcance más allá de la fase. Los hooks se editan en src/hooks/
y se compilan con npm run build; nunca edites dist/. Usa MEMPUNK_VAULT
apuntando a un vault temporal en cualquier prueba manual.
```

**Prompt de cierre por fase**

```
Revisa la rama actual contra el "Criterio de salida" de la Fase N en
docs/plan-v3.md. Para cada punto: cumplido / no cumplido / no verificable,
con la evidencia (test, comando o archivo). No arregles nada todavía.
```

**Orden de subtareas**

- [ ] 0.6 CLAUDE.md de desarrollo
- [ ] 0.1 Empaquetar `vault-skills/` + test de `npm pack`
- [ ] 0.5 Limpiar la raíz del repo
- [ ] 0.4 Timeouts de SessionEnd
- [ ] 0.7 `vault upgrade --help` no migra
- [ ] 0.3 `mempunk context` + restauración con `state.md`
- [ ] 0.8 Auto-start determinista
- [ ] 0.2 Quitar el cálculo de % de `on-prompt.js` (simplificado)
- [ ] 1.1 Capa de servicios (empezar por decisiones y sesiones)
- [ ] 1.2–1.5 `mempunk mcp` con `get_context`, `save_decision`, `log_session`, `search`
- [ ] Resto de herramientas MCP
- [ ] 2.x Plugin y `hooks migrate`
- [ ] 3.x Hooks incrementales y registro automático
- [ ] 4.x Skills, auto-start determinista, retiro de saver/loader
- [ ] 5.x `memory link` y MCP en Gemini/opencode

## Riesgos y decisiones abiertas

**Riesgos**

| Riesgo | Mitigación |
| --- | --- |
| Claude Code cambia campos de payload de hooks | `readHookInput()` valida y registra campos faltantes; tests con fixtures por evento |
| Plugin y hooks manuales instalados a la vez (doble ejecución) | `hooks install --check` lo detecta; `hooks migrate` lo resuelve |
| Versión del plugin y del CLI desalineadas | SessionStart compara versiones y avisa; versión sincronizada en el build |
| Descripciones de herramientas MCP que el modelo ignora | Casos de `claude plugin eval`; iterar el texto de las descripciones |
| Contención en SQLite con varias sesiones | WAL + `busy_timeout` + transacciones; test de concurrencia |
| Snapshots con extractos de conversación sincronizados por git | Mantener el aviso de repo privado; con la Fase 3 se guardan menos mensajes crudos |

**Decisiones abiertas** (preguntar al usuario antes de decidir)

- [ ] ¿El plugin vive en `plugin/` dentro de este repo o en un repo aparte? Recomendación: mismo repo, para versionar juntos.
- [ ] ¿Se mantiene `@mempunk-recover` o lo cubre `get_context` + checkpoints?
- [ ] ¿`update_state` reemplaza el archivo entero o acepta parches por sección?
- [ ] ¿Los avisos de % de contexto siguen teniendo valor ahora que Claude Code compacta solo y re-adjunta skills? Medir tras la Fase 3 antes de invertir más.
- [ ] ¿Se exponen push/pull como herramientas MCP en el futuro, con confirmación explícita?
- [ ] ¿Se hace la Fase 3 antes que la 2? Ya prevé `.mempunk/sessions/` sin plugin, y así la Fase 2 solo empaqueta.

## Referencias

- [Plugins — manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md)
- [Plugins — components](https://code.claude.com/docs/en/plugins/components.md)
- [Plugins — CLI reference](https://code.claude.com/docs/en/plugins/cli-reference.md)
- [Hooks](https://code.claude.com/docs/en/hooks.md)
- [Memory](https://code.claude.com/docs/en/memory.md)
- [Skills](https://code.claude.com/docs/en/skills.md)
- [Subagents](https://code.claude.com/docs/en/sub-agents.md)
- [Statusline](https://code.claude.com/docs/en/statusline.md)
- [MCP](https://code.claude.com/docs/en/mcp.md)
- [Sessions](https://code.claude.com/docs/en/sessions.md)
