[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Memoria persistente entre sesiones de Claude Code.

## El Problema

Los CLIs de IA no tienen memoria entre sesiones. Cada vez que inicias una conversacion nueva, tu asistente no sabe:

- En que estabas trabajando ayer
- Que decisiones de arquitectura ya se tomaron
- Que tareas estan pendientes o completadas
- Que archivos se modificaron y por que
- Cuales eran los proximos pasos
- Que herramienta CLI estabas usando (Claude Code? opencode? gemini-cli?)

Terminas repitiendo contexto, re-explicando decisiones y perdiendo impulso. Mientras mas largo es el proyecto, peor se pone.

Pero hay un problema mas profundo: aunque un CLI *si* recordara todo, el historial en crudo es contexto ineficiente. Leer 20 session logs para entender donde esta un proyecto es casi tan lento como empezar desde cero. Lo que necesitas no es un log — es un estado compilado que se vuelve mas preciso con el tiempo, no una pila de entradas que sigue creciendo.

Ademas, si alternas entre diferentes CLIs de IA — Claude Code para unos proyectos, opencode o gemini-cli para otros — cada herramienta vive en su propio silo. Tu contexto queda fragmentado entre herramientas.

## La Solucion

Mempunk le da a tu IA un vault estructurado respaldado por SQLite y archivos markdown — y lo mantiene compilado, no solo almacenado.

- **Inicio de sesion** (`vault-skills/session-start.md`): el asistente carga el estado compilado del proyecto desde `wiki/state.md` si existe, o los ultimos session logs si no. Sin re-explicar. Sin re-derivar. Retoma donde quedaste.
- **Fin de sesion** (`vault-skills/session-end.md`): el asistente escribe el session log, actualiza el backlog y reescribe el estado compilado — una sintesis fresca de todo lo que ha pasado hasta ahora. La siguiente sesion arranca con un snapshot denso y preciso en lugar de historial en crudo.
- **El vault** (siempre): cada proyecto acumula un `wiki/` — una base de conocimiento que el LLM construye y mantiene. Cada sesion lo hace mas preciso. Cada fuente que agregas lo enriquece.

El vault son archivos markdown organizados por proyecto, con SQLite como backend estructurado. Tu lo gestionas con un CLI. Tu asistente de IA lo navega con los protocolos definidos en `vault-skills/`. Tambien funciona como vault de Obsidian, para navegar y buscar todo visualmente.

Como el vault es agnostico al CLI, puedes usar el mismo vault con Claude Code, opencode y gemini-cli simultaneamente. Cambia entre CLIs sin perder contexto.

## Inicio Rapido

```bash
npm install -g mempunk
mempunk setup
```

`setup` pregunta que CLI de IA usas y configura todo: crea `~/Dev-Brain/`, lo vincula a tu CLI, e instala hooks + agentes (Claude Code) o los protocolos vault-skills (Gemini CLI / opencode).

## Estructura del Vault

```
~/Dev-Brain/
├── projects/
│   └── <id>/
│       ├── INDEX.md        metadatos (nombre, created_at, status)
│       ├── decisions/      architecture decision records (ADRs)
│       ├── skills/         stack, patrones, convenciones — se cargan cada sesion
│       └── wiki/           base de conocimiento mantenida por el LLM
│           ├── state.md    estado compilado — reescrito cada sesion
│           ├── log.md      historial append-only de sesiones
│           ├── index.md    catalogo de todas las paginas del wiki
│           └── sources/    documentos para que el LLM ingiera
├── areas/                  responsabilidades continuas, no proyectos
├── resources/              links y referencias
├── daily/                  logs diarios narrativos
└── .mempunk/
    ├── mempunk.db          base de datos SQLite — no editar manualmente
    └── hooks.log           log de ejecucion de hooks del ciclo de vida
```

`wiki/state.md` es el diferencial central. Es el *estado compilado* del proyecto — lo que es verdad ahora, no lo que paso en orden. El LLM lo reescribe al final de cada sesion. Leer un archivo compilado es mas rapido y preciso que leer N session logs. Cada sesion lo hace mas preciso. Cada fuente que agregas lo enriquece. Nunca lo escribes tu mismo.

## Flujo de Sesion

### Inicio de sesion

**Con agentes (Claude Code, modo automatico):** invoca `@mempunk-loader`. Lista tus proyectos, pregunta con cual trabajar, lo activa y devuelve un resumen compacto de contexto. Si activaste `auto-start`, se ejecuta automaticamente al abrir Claude Code.

**Sin agentes (modo manual / Gemini CLI / opencode):** sigue `vault-skills/session-start.md`. El asistente:

1. Ejecuta `mempunk project activate <id>` para establecer el proyecto activo
2. Ejecuta `mempunk session last <project_id>` para saber que hizo la sesion anterior
3. Ejecuta `mempunk skill list <project_id>` y lee todos los archivos de skills relevantes
4. Lee el estado del proyecto — `wiki/state.md` si existe, si no los ultimos 3 session log entries
5. Ejecuta `mempunk backlog list <project_id> --status pending`
6. Confirma el contexto antes de continuar

### Saves incrementales (durante la sesion)

El asistente guarda contexto inmediatamente cuando ocurre — no solo al final de la sesion:

- **Decision arquitectural tomada** → `mempunk decision add` inmediatamente
- **Bug importante resuelto** → `mempunk session log` con el resumen del fix
- **Tarea completada o iniciada** → `mempunk backlog update` inmediatamente
- **Skill del proyecto modificado** → `mempunk skill update` inmediatamente
- **Link o referencia relevante capturada** → `mempunk resource add` inmediatamente
- **Bloque de trabajo importante terminado** → `mempunk daily log` con resumen del bloque

Si la sesion se interrumpe, el contexto importante ya esta persistido.

### Fin de sesion (`vault-skills/session-end.md`)

Al terminar una sesion, el asistente:

1. Ejecuta `mempunk backlog update` por cada tarea que cambio de estado en la sesion
2. Ejecuta `mempunk decision add` por cada decision importante no guardada aun
3. Ejecuta `mempunk session log` con un resumen y la lista de archivos tocados
4. Actualiza `wiki/state.md` — lo reescribe como sintesis compilada del estado actual del proyecto
5. Agrega al `wiki/log.md`
6. Crea o agrega al `daily/YYYY-MM-DD.md`

La siguiente sesion retoma exactamente donde esta termino.

## Hooks del Ciclo de Vida (Claude Code)

Cuando los hooks estan instalados (`mempunk hooks install`), Mempunk responde automaticamente a los eventos de sesion de Claude Code:

| Hook | Evento | Comportamiento |
|------|--------|---------------|
| `on-prompt.js` | Antes de cada turno | **ContextWarning** — alerta al 70%, 80% y 84% de uso de contexto |
| `on-stop.js` | Despues de cada respuesta | **AutoCheckpoint** — guarda un checkpoint incremental cada 5 turnos |
| `on-compact.js` | Antes de compactacion de contexto | **CompactGuard** — captura un snapshot completo antes de que Claude compacte |
| `on-start.js` | Inicio de sesion | **CompactRestore** — restaura el contexto desde el ultimo snapshot tras una compactacion |

El intervalo de AutoCheckpoint se puede configurar con la variable de entorno `MEMPUNK_CHECKPOINT_INTERVAL` (por defecto: 5).

Los hooks tambien instalan una integracion de **statusline** — una barra de contexto en tiempo real en la barra de estado de Claude Code:

```
🟢 ███░░░░░░ 32% | claude-sonnet | $0.12
```

El emoji indica el nivel de presion: 🟢 por debajo del 70%, ⚠️ en 70–80%, 🔶 en 80–84%, 🚨 por encima del 84%.

Para recuperar contexto de una sesion anterior o tras una interrupcion:

```bash
mempunk session recover <project_id>     # ver el ultimo snapshot disponible
mempunk session checkpoints <project_id> # listar todos los checkpoints guardados
```

## Agentes (Claude Code)

Se instalan tres sub-agentes junto con los hooks:

| Agente | Modelo | Proposito |
|--------|--------|-----------|
| `@mempunk-loader` | Sonnet | Carga el contexto del proyecto al inicio de sesion — lista proyectos, activa uno, devuelve resumen compacto |
| `@mempunk-saver` | Haiku (background) | Guarda decisiones, session logs y actualizaciones de backlog durante la sesion sin interrumpir el flujo |
| `@mempunk-recover` | Sonnet | Recupera el contexto de una sesion cerrada o interrumpida manualmente |

`@mempunk-loader` reemplaza el protocolo manual de inicio de sesion. Si `auto-start` esta activado (`mempunk auto-start on`), se ejecuta automaticamente cada vez que Claude Code se abre.

`@mempunk-saver` se activa cuando escribes comandos de guardado estructurados:

```
SAVE decision: project=<id> title="Usar JWT para auth"
SAVE session: project=<id> summary="Implemente endpoint de login"
```

## Comandos

### Configuracion

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk setup` | Setup interactivo: init + link + hooks install | `mempunk setup` |
| `mempunk init` | Crear estructura del vault e inicializar BD | `mempunk init` |
| `mempunk link [--cli <name>]` | Vincular vault a Claude Code, opencode o gemini-cli | `mempunk link --cli opencode` |
| `mempunk unlink [--cli <name>]` | Desvincular de un CLI | `mempunk unlink` |
| `mempunk status` | Dashboard: vault, proyectos, backlogs, ultima sesion | `mempunk status` |
| `mempunk cli list` | Listar CLIs compatibles y su estado de vinculacion | `mempunk cli list` |
| `mempunk auto-start on\|off` | Activar/desactivar `@mempunk-loader` automatico al inicio | `mempunk auto-start on` |

### Proyectos

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk project add <id> <name>` | Registrar un proyecto nuevo | `mempunk project add api "Backend API"` |
| `mempunk project list` | Listar todos los proyectos | `mempunk project list` |
| `mempunk project activate <id>` | Establecer el proyecto activo | `mempunk project activate api` |
| `mempunk log <id>` | Abrir el INDEX.md del proyecto en el editor | `mempunk log api` |
| `mempunk remove <id> --yes` | Eliminar un proyecto (BD + disco, irreversible) | `mempunk remove api --yes` |

### Backlog

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk backlog add <project_id> "<title>"` | Agregar tarea al backlog | `mempunk backlog add api "Agregar auth"` |
| `mempunk backlog add ... --priority <1\|2\|3>` | Agregar tarea con prioridad (default: 2) | `mempunk backlog add api "Fix CORS" --priority 1` |
| `mempunk backlog list <project_id>` | Listar todas las tareas | `mempunk backlog list api` |
| `mempunk backlog list ... --status <valor>` | Filtrar por status | `mempunk backlog list api --status pending` |
| `mempunk backlog update <id> --status <valor>` | Actualizar status de tarea | `mempunk backlog update bl_123 --status done` |
| `mempunk backlog update <id> --priority <valor>` | Actualizar prioridad de tarea | `mempunk backlog update bl_123 --priority 1` |

### Decisiones, Skills y Recursos

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk decision add <project_id> "<title>"` | Crear un ADR con archivo markdown | `mempunk decision add api "Usar JWT"` |
| `mempunk decision add ... --tags "t1,t2"` | Crear decision con etiquetas | `mempunk decision add api "JWT" --tags "auth,seguridad"` |
| `mempunk decision list <project_id>` | Listar decisiones del proyecto | `mempunk decision list api` |
| `mempunk skill add <project_id> <name>` | Crear archivo de skill del proyecto | `mempunk skill add api stack` |
| `mempunk skill list <project_id>` | Listar skills del proyecto | `mempunk skill list api` |
| `mempunk skill update <id> --file <path>` | Sobreescribir contenido del skill | `mempunk skill update sk_123 --file stack.md` |
| `mempunk resource add <project_id> "<title>"` | Capturar un recurso externo | `mempunk resource add api "JWT spec" --url https://jwt.io` |
| `mempunk resource list <project_id>` | Listar recursos del proyecto | `mempunk resource list api` |

### Sesiones y Logs

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk session log <project_id> "<summary>"` | Registrar sesion de trabajo | `mempunk session log api "Implemente endpoint de login"` |
| `mempunk session log ... --files "p1,p2"` | Registrar sesion con archivos tocados | `mempunk session log api "Fix" --files "src/auth.js"` |
| `mempunk session last <project_id>` | Ver la ultima sesion registrada | `mempunk session last api` |
| `mempunk session recover <project_id>` | Ver el ultimo snapshot disponible (checkpoint o compact) | `mempunk session recover api` |
| `mempunk session checkpoints <project_id>` | Listar todos los checkpoints y compact snapshots | `mempunk session checkpoints api` |
| `mempunk daily log <project_id> "<content>"` | Agregar entrada al log diario | `mempunk daily log api "Termine el modulo de auth"` |
| `mempunk daily list <project_id>` | Listar entradas del log diario | `mempunk daily list api` |

### Busqueda

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk search "<query>"` | Busqueda full-text en el vault | `mempunk search "refresh token"` |
| `mempunk search "<query>" --project <id>` | Busqueda dentro de un proyecto | `mempunk search "auth" --project api` |

### Hooks y Agentes

| Comando | Descripcion | Ejemplo |
|---------|-------------|---------|
| `mempunk hooks install` | Instalar hooks + agentes globalmente en `~/.claude/` | `mempunk hooks install` |
| `mempunk hooks install --local` | Instalar hooks en `.claude/` del proyecto actual | `mempunk hooks install --local` |
| `mempunk hooks install --check` | Verificar hooks, agentes y statusline instalados | `mempunk hooks install --check` |
| `mempunk hooks uninstall` | Eliminar hooks de Mempunk | `mempunk hooks uninstall` |

## Mantenimiento del Vault

```bash
# Verificar consistencia entre archivos en disco y la base de datos
mempunk sync

# Verificar integridad del vault — archivos faltantes, archivos sin registro
mempunk doctor

# Ver version del schema del vault y version del CLI
mempunk vault version

# Aplicar migraciones de schema pendientes
mempunk vault upgrade
```

`mempunk vault upgrade` es seguro de ejecutar en cualquier momento. Solo aplica migraciones pendientes y nunca modifica datos existentes.

## Compatibilidad

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vincular/desvincular vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Protocolo inicio de sesion | ✔ | ✔ | ✔ |
| Protocolo fin de sesion | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automaticos | ✔ | ✔ | ✔ |
| Backlog inteligente | ✔ | ✔ | ✔ |
| Daily consolidado | ✔ | ✔ | ✔ |
| Captura de conocimiento | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (`state.md`) | ✔ | ✔ | ✔ |
| Hooks del ciclo de vida (AutoCheckpoint, CompactGuard) | ✔ | ✘ | ✘ |
| Statusline (barra de uso de contexto) | ✔ | ✘ | ✘ |
| Agentes (`@mempunk-loader`, `@mempunk-saver`) | ✔ | ✘ | ✘ |
| Multi-CLI simultaneo | ✔ | ✔ | ✔ |

> Los protocolos de sesion, ADRs, actualizaciones de backlog y logs diarios son features a nivel de vault — funcionan en cualquier CLI que lea el `CLAUDE.md` del vault. Los hooks del ciclo de vida y los agentes requieren la infraestructura de sub-agentes y hooks de Claude Code.

## Como se Compara

| | Mempunk | RAG / subida de archivos | Notas manuales | Engram |
|---|:---:|:---:|:---:|:---:|
| Persiste entre sesiones | ✔ | ✘ | ✔ | Parcial |
| El conocimiento se acumula | ✔ | ✘ | Depende | ✘ |
| El LLM hace el mantenimiento | ✔ | ✔ | ✘ | ✔ |
| Funciona offline, sin infraestructura | ✔ | ✘ | ✔ | ✘ |
| Multi-CLI | ✔ | ✘ | ✔ | ✘ |
| Guarda contexto durante la sesion | ✔ | ✘ | ✘ | ✘ |
| Sobrevive compactaciones de contexto | ✔ | ✘ | ✘ | ✘ |

**vs RAG / subida de archivos:** Herramientas como NotebookLM o la subida de archivos de ChatGPT recuperan desde documentos en crudo en el momento de la consulta. Nada se acumula. Haz la misma pregunta dos veces y el LLM hace el mismo trabajo dos veces. Mempunk compila contexto incrementalmente — cada sesion produce un snapshot mas rico y preciso.

**vs notas manuales:** Un wiki que escribes tu mismo funciona — hasta que la carga de mantenimiento lo mata. Actualizar referencias cruzadas entre decenas de paginas es tedioso. La gente abandona los wikis porque el costo de mantenimiento crece mas rapido que el valor. Mempunk delega todo eso al LLM.

**vs Engram:** Engram usa almacenamiento solo en SQLite sin capa legible por humanos. Mempunk mantiene markdown como la capa humana con SQLite como backend estructurado. El vault es portable, legible en cualquier editor de texto, y funciona como vault de Obsidian.

## Idiomas

Documentacion disponible en: **English** (por defecto), **Español**, **Português**, **Français**

## Licencia

[MIT](LICENSE)
