[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerebro persistente para CLIs de IA — un vault de conocimiento que compila y acumula contexto entre sesiones, no solo lo registra. Compatible con **Claude Code**, **opencode** y **gemini-cli**.

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

Mempunk le da a tu IA un vault estructurado que funciona como su memoria persistente — y lo mantiene compilado, no solo almacenado.

- **Inicio de sesion** (`/mempunk`): el asistente carga el estado compilado del proyecto desde `wiki/state.md` si existe, o los ultimos session logs si no. Sin re-explicar. Sin re-derivar. Retoma donde quedaste.
- **Fin de sesion** (`/session-end`): el asistente escribe el session log, actualiza el backlog, y reescribe el estado compilado — una sintesis fresca de todo lo que ha pasado hasta ahora. La siguiente sesion arranca con un snapshot denso y preciso en lugar de historial en crudo.
- **El vault** (siempre): cada proyecto acumula un `wiki/` — una base de conocimiento que el LLM construye y mantiene. Cada sesion lo hace mas preciso. Cada fuente que agregas lo enriquece.

El vault son archivos markdown organizados por proyecto. Tu lo gestionas con un CLI. Tu asistente de IA lo navega con slash commands. Tambien funciona como vault de Obsidian, asi que puedes navegar y buscar todo visualmente.

Sin base de datos. Sin servidor. Sin API keys. Solo archivos.

Y como el vault es agnostico al CLI, puedes usar el mismo vault con Claude Code, opencode y gemini-cli simultaneamente. Cambia entre CLIs sin perder contexto.

## Inicio Rapido

```bash
# 1. Ejecuta el setup (pregunta que CLI usaras, crea y vincula un vault)
npx mempunk

# 2. Agregar un proyecto
npx mempunk project mi-app

# 3. En cualquier sesion de tu CLI, escribe:
/mempunk

# 4. Cuando termines, escribe:
/session-end
```

## Referencia del CLI

### Gestion del vault

```
mempunk setup                  Setup interactivo completo (recomendado)
mempunk init [ruta] [opciones] Crear un nuevo vault
mempunk link <ruta>            Vincular un vault a tu CLI (soporta multiples)
mempunk unlink [ruta]          Desvincular un vault (interactivo si hay varios)
mempunk status                 Mostrar todos los vaults vinculados y sus proyectos
mempunk cli add <nombre>       Agregar un CLI (claude-code, opencode, gemini-cli)
mempunk cli remove <nombre>    Quitar un CLI
mempunk cli list               Mostrar CLIs activos
mempunk auto-start [on|off]    Auto-ejecutar /mempunk en nuevas sesiones
mempunk -v                     Mostrar version
```

### Gestion de proyectos

```
mempunk project <nombre>       Agregar un nuevo proyecto al vault
mempunk remove <nombre>        Eliminar un proyecto del vault
mempunk backlog <nombre>       Ver el backlog de un proyecto en terminal
mempunk log <nombre>           Abrir el session log en tu editor
mempunk sync                   Agregar archivos faltantes a proyectos existentes
mempunk doctor                 Verificar salud e integridad del vault
```

> Todos los comandos de proyecto preguntan cual vault usar cuando hay varios vinculados.

### Opciones

```
--lang <codigo>    Idioma: en, es, pt, fr (por defecto: en)
--preset <nombre>  Preset: full, standard, minimal
--projects         Incluir carpeta projects
--areas            Incluir carpeta areas
--resources        Incluir carpeta resources
--daily            Incluir carpeta daily
```

### Ejemplos

```bash
mempunk setup --lang es
mempunk init ./vault --preset full
mempunk init ./vault --projects --resources --daily
mempunk project mi-saas
mempunk remove mi-saas
mempunk backlog mi-saas
mempunk log mi-saas
mempunk sync
mempunk doctor
mempunk status
mempunk cli add opencode
mempunk cli add gemini-cli
mempunk cli list
mempunk cli remove opencode
```

## Estructura del Vault

```
vault/
├── CLAUDE.md              # Punto de entrada — Claude lee esto primero
├── projects/
│   └── mi-proyecto/
│       ├── INDEX.md       # Entrada rapida — estado, top 3 backlog, enlaces
│       ├── overview.md    # Que es el proyecto, stack, repo, estado
│       ├── architecture.md # Decisiones tecnicas y diagramas
│       ├── conventions.md # Reglas del proyecto, estandares de codigo, patrones
│       ├── backlog.md     # Tareas priorizadas (- [ ] / - [x])
│       ├── session-log.md # Que hizo Claude en cada sesion
│       ├── decisions/     # Architecture Decision Records
│       └── wiki/          # Wiki del proyecto (estado compilado, log, fuentes)
├── areas/                 # Responsabilidades continuas (no proyectos)
│   └── INDEX.md           # Indice de areas
├── resources/             # Conocimiento tecnico reutilizable
│   └── INDEX.md           # Indice de recursos por categoria
└── daily/                 # Logs diarios consolidados
    └── INDEX.md           # Indice de logs diarios
```

`CLAUDE.md` enlaza directamente al `INDEX.md` de cada proyecto — nunca a archivos internos. Cada `INDEX.md` enlaza a los archivos internos del proyecto. Esto mantiene el grafo de Obsidian limpio (arbol, no telarana).

`mempunk project <nombre>` crea esta estructura y registra el proyecto en `CLAUDE.md` con un `[[wikilink]]` directo a su `INDEX.md`.

`mempunk sync` agrega archivos de template faltantes (como `INDEX.md`, `conventions.md`, `wiki/`) a proyectos existentes sin sobreescribir. Tambien actualiza el `CLAUDE.md` con el ultimo protocolo preservando tu lista de proyectos y preferencias configuradas.

## Wiki del Proyecto

Cada proyecto incluye un directorio `wiki/` — una base de conocimiento ligera que el LLM construye y mantiene automaticamente.

- **`wiki/state.md`** — el estado compilado del proyecto. Reescrito por el LLM al final de cada sesion. Refleja *lo que es verdad ahora* — la arquitectura actual, decisiones activas, blockers y proximos pasos — no lo que paso en orden. Leer un archivo compilado es mas rapido y preciso que leer N session logs.
- **`wiki/sources/`** — deposita documentos aqui (specs, articulos, transcripciones, docs de API) y pide al LLM que los ingiera. El LLM lee cada fuente e integra la informacion relevante al wiki.
- **`wiki/index.md`** — catalogo de todas las paginas del wiki con descripciones de una linea.
- **`wiki/log.md`** — registro append-only de cada sesion e ingesta en formato `## [YYYY-MM-DD] tipo | descripcion`, parseable con herramientas estandar.

La propiedad clave: el wiki *se compone*. Cada sesion hace `wiki/state.md` mas preciso. Cada fuente que agregas enriquece el contexto. Nunca lo escribes tu mismo — el LLM hace todo el mantenimiento.

## CLIs Soportados

mempunk soporta el uso de multiples CLIs simultaneamente con el mismo vault. Durante `setup`, selecciona uno o mas CLIs. Puedes agregar mas despues con `mempunk cli add <nombre>`. Cada CLI usa su mecanismo nativo:

| CLI | Registro del vault | Ubicacion de skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` → `additionalDirectories[]` | `~/.claude/skills/<name>/SKILL.md` |
| **opencode** | `~/.config/opencode/AGENTS.md` (marcadores) | `~/.config/opencode/skills/<name>/SKILL.md` |
| **gemini-cli** | `~/.gemini/settings.json` → `context.includeDirectories[]` | `~/.gemini/skills/<name>/SKILL.md` |

El vault en si (archivos markdown en `projects/`, `daily/`, etc.) es el mismo independientemente del CLI — es portable. Cuando haces `link` o `unlink` de un vault, la operacion aplica a todos los CLIs activos a la vez. Tus CLIs activos se persisten en `~/.mempunk/config.json`.

### Compatibilidad de features

| Feature | Claude Code | opencode | gemini-cli |
|---|:---:|:---:|:---:|
| Vincular/desvincular vault | ✔ | ✔ | ✔ |
| Multi-vault | ✔ | ✔ | ✔ |
| Skill `/mempunk` | ✔ | ✔ | ✔ |
| Skill `/session-end` | ✔ | ✔ | ✔ |
| Smart Context Check | ✔ | ✔ | ✔ |
| ADRs automaticos | ✔ | ✔ | ✔ |
| Backlog inteligente | ✔ | ✔ | ✔ |
| Daily consolidado | ✔ | ✔ | ✔ |
| Captura de conocimiento | ✔ | ✔ | ✔ |
| `sync` / `doctor` | ✔ | ✔ | ✔ |
| Wiki (state.md) | ✔ | ✔ | ✔ |
| Auto-start | ✔ | ✘ | ✔ |
| Multi-CLI simultaneo | ✔ | ✔ | ✔ |

> Los skills, ADRs, actualizaciones de backlog y logs diarios son features a nivel de vault — funcionan en cualquier CLI que lea el `CLAUDE.md` del vault. Auto-start requiere hooks de sesion, que opencode no soporta.

## Flujo de Sesion

### Inicio: `/mempunk`

Se instala globalmente durante el setup en la ruta de skills que use tu CLI (ver tabla arriba). Al escribir `/mempunk`, el asistente:

1. Descubre todos los vaults vinculados automaticamente
2. Si hay multiples vaults, pregunta cual usar
3. Lee el `CLAUDE.md` del vault y lista los proyectos disponibles
4. Pregunta en cual proyecto quieres trabajar — nunca asume
5. Lee el `INDEX.md`, `overview.md` y `conventions.md` del proyecto
6. Lee el estado del proyecto — si existe `wiki/state.md`, lo lee (estado compilado); si no, lee los ultimos 3 session logs
7. **Smart Context Check** — detecta gaps (session-log viejo, overview vacio, arquitectura sin definir, backlog vacio) y ofrece revisar el repo real si es necesario
8. Confirma el contexto antes de continuar

### Cierre: `/session-end`

Se instala junto a `/mempunk`. Al escribir `/session-end`, el asistente:

1. Escribe una entrada estructurada en el `session-log.md` del proyecto
2. **Actualiza el backlog** — marca tareas completadas, agrega nuevas, reordena por prioridad
3. **Actualiza INDEX.md** — refleja la ultima sesion y top 3 del backlog
4. **Actualiza estado del wiki** — si existe `wiki/`, reescribe `wiki/state.md` con sintesis compilada y agrega al `wiki/log.md`
5. **Escribe log diario** — crea o actualiza `daily/YYYY-MM-DD.md` con resumen consolidado
6. Nota convenciones que se establecieron o cambiaron
7. Confirma que se registro

La siguiente sesion retoma exactamente donde esta termino.

### Skills automaticos

El `CLAUDE.md` del vault incluye reglas que el asistente sigue automaticamente durante cualquier sesion:

- **ADRs automaticos** — Cuando se toma una decision tecnica (arquitectura, stack, patrones), se crea un ADR en `decisions/` sin pedirlo
- **Captura de conocimiento** — Cuando se resuelve un problema tecnico reutilizable, la solucion se guarda en `resources/` por categoria
- **Contexto de areas** — Cuando el usuario pregunta sobre universidad o infraestructura, el asistente lee el INDEX del area correspondiente primero

## Mantenimiento del Vault

```bash
# Agregar archivos faltantes a proyectos existentes y sincronizar protocolo de CLAUDE.md
mempunk sync

# Verificar integridad del vault — proyectos fantasma, archivos faltantes, registros rotos
mempunk doctor
```

`mempunk sync` tambien actualiza las secciones de protocolo en `CLAUDE.md` con la ultima version preservando tu lista de proyectos y preferencias configuradas.

## Multiples Vaults

Puedes vincular multiples vaults y cambiar entre ellos al inicio de sesion:

```bash
mempunk link ./vault-trabajo
mempunk link ./vault-personal

# /mempunk preguntara cual vault usar

mempunk unlink ./vault-personal   # Desvincular un vault especifico
mempunk unlink                    # Seleccion interactiva si hay varios
mempunk status                    # Muestra todos los vaults vinculados
```

## Multiples CLIs

Usa el mismo vault con diferentes CLIs de IA al mismo tiempo:

```bash
# Agregar un segundo CLI
mempunk cli add opencode

# Agregar un tercero
mempunk cli add gemini-cli

# link/unlink ahora registra en todos los CLIs activos a la vez
mempunk link ./mi-vault    # Registra en Claude Code, opencode Y gemini-cli

# Ver cuales CLIs estan activos
mempunk cli list

# Quitar uno
mempunk cli remove gemini-cli
```

`doctor` verifica skills en todos los CLIs activos. `status` agrega vaults de todos los CLIs.

## Auto-start

Carga automaticamente el contexto del vault al inicio de cada nueva sesion de Claude Code:

```bash
# Activar
mempunk auto-start on

# Desactivar
mempunk auto-start off

# Ver estado
mempunk auto-start
```

Esto instala un hook `SessionStart` en el `settings.json` del CLI. Cuando esta activado, `/mempunk` se ejecuta automaticamente en cada nueva sesion — no necesitas escribirlo manualmente. Si tienes multiples CLIs soportados activos, el comando pregunta cual configurar.

> **Nota:** Auto-start esta disponible para **Claude Code** y **gemini-cli**. opencode no soporta hooks de sesion. Si desvinculas todos los vaults, los hooks se eliminan automaticamente.

## Compatible con Obsidian

Todos los archivos usan `[[wikilinks]]`. Abre el vault en Obsidian y la vista de grafo muestra las conexiones entre `CLAUDE.md`, overviews, backlogs, docs de arquitectura, convenciones y session logs.

## Como se Compara

| | Mempunk | RAG / subida de archivos | Notas manuales |
|---|---|---|---|
| Persiste entre sesiones | ✔ | ✘ | ✔ |
| El conocimiento se acumula | ✔ | ✘ | Depende |
| El LLM hace el mantenimiento | ✔ | ✔ | ✘ |
| Funciona offline, sin infraestructura | ✔ | ✘ | ✔ |
| Multi-CLI | ✔ | ✘ | ✔ |

**vs RAG / subida de archivos:** Herramientas como NotebookLM o la subida de archivos de ChatGPT recuperan desde documentos en crudo en el momento de la consulta. Nada se acumula. Haz la misma pregunta dos veces y el LLM hace el mismo trabajo dos veces. Mempunk compila contexto incrementalmente — cada sesion produce un snapshot mas rico y preciso.

**vs notas manuales:** Un wiki que escribes tu mismo funciona — hasta que la carga de mantenimiento lo mata. Actualizar referencias cruzadas entre decenas de paginas es tedioso. La gente abandona los wikis porque el costo de mantenimiento crece mas rapido que el valor. Mempunk delega todo eso al LLM.

## Idiomas

Disponibles: **English** (por defecto), **Español**, **Português**, **Français**

Usa `--lang es`, `--lang pt` o `--lang fr` con cualquier comando, o seleccionalo interactivamente durante el setup.

## Licencia

[MIT](LICENSE)
