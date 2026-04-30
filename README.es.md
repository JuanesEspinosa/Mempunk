[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerebro persistente para CLIs de IA — un vault de markdown que sobrevive entre sesiones. Compatible con **Claude Code**, **opencode** y **gemini-cli**.

## El Problema

Los CLIs de IA no tienen memoria entre sesiones. Cada vez que inicias una conversacion nueva, tu asistente no sabe:

- En que estabas trabajando ayer
- Que decisiones de arquitectura ya se tomaron
- Que tareas estan pendientes o completadas
- Que archivos se modificaron y por que
- Cuales eran los proximos pasos
- Que herramienta CLI estabas usando (Claude Code? opencode? gemini-cli?)

Terminas repitiendo contexto, re-explicando decisiones y perdiendo impulso. Mientras mas largo es el proyecto, peor se pone.

Ademas, si alternas entre diferentes CLIs de IA — Claude Code para unos proyectos, opencode o gemini-cli para otros — cada herramienta vive en su propio silo. Tu contexto queda fragmentado entre herramientas.

## La Solucion

Mempunk es un vault de markdown estructurado que funciona como la memoria persistente de tu asistente. Trabaja en dos momentos:

- **Inicio de sesion** (`/mempunk`): el asistente lee el vault, ve tus proyectos, carga el overview relevante, las convenciones, los ultimos session logs y el backlog. Retoma donde quedaste.
- **Fin de sesion** (`/session-end`): el asistente escribe que hizo, que decisiones se tomaron, que falta y que archivos se tocaron. La siguiente sesion arranca con contexto completo.

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
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas (no proyectos)
│   └── INDEX.md           # Indice de areas
├── resources/             # Conocimiento tecnico reutilizable
│   └── INDEX.md           # Indice de recursos por categoria
└── daily/                 # Logs diarios consolidados
    └── INDEX.md           # Indice de logs diarios
```

`CLAUDE.md` enlaza directamente al `INDEX.md` de cada proyecto — nunca a archivos internos. Cada `INDEX.md` enlaza a los archivos internos del proyecto. Esto mantiene el grafo de Obsidian limpio (arbol, no telarana).

`mempunk project <nombre>` crea esta estructura y registra el proyecto en `CLAUDE.md` con un `[[wikilink]]` directo a su `INDEX.md`.

`mempunk sync` agrega archivos de template faltantes (como `INDEX.md`, `conventions.md`) a proyectos existentes sin sobreescribir.

## CLIs Soportados

mempunk soporta el uso de multiples CLIs simultaneamente con el mismo vault. Durante `setup`, selecciona uno o mas CLIs. Puedes agregar mas despues con `mempunk cli add <nombre>`. Cada CLI usa su mecanismo nativo:

| CLI | Registro del vault | Ubicacion de skills |
|---|---|---|
| **Claude Code** | `~/.claude.json` → `additionalDirectories[]` | `~/.claude/skills/<name>/SKILL.md` |
| **opencode** | `~/.config/opencode/AGENTS.md` (marcadores) | `~/.config/opencode/skills/<name>/SKILL.md` |
| **gemini-cli** | `~/.gemini/settings.json` → `context.includeDirectories[]` | `~/.gemini/skills/<name>/SKILL.md` |

El vault en si (archivos markdown en `projects/`, `daily/`, etc.) es el mismo independientemente del CLI — es portable. Cuando haces `link` o `unlink` de un vault, la operacion aplica a todos los CLIs activos a la vez. Tus CLIs activos se persisten en `~/.mempunk/config.json`.

## Flujo de Sesion

### Inicio: `/mempunk`

Se instala globalmente durante el setup en la ruta de skills que use tu CLI (ver tabla arriba). Al escribir `/mempunk`, el asistente:

1. Descubre todos los vaults vinculados automaticamente
2. Si hay multiples vaults, pregunta cual usar
3. Lee el `CLAUDE.md` del vault y lista los proyectos disponibles
4. Pregunta en cual proyecto quieres trabajar — nunca asume
5. Lee el `INDEX.md`, `overview.md` y `conventions.md` del proyecto
6. Lee los ultimos 3 session logs y el backlog
7. **Smart Context Check** — detecta gaps (session-log viejo, overview vacio, arquitectura sin definir, backlog vacio) y ofrece revisar el repo real si es necesario
8. Confirma el contexto antes de continuar

### Cierre: `/session-end`

Se instala junto a `/mempunk`. Al escribir `/session-end`, el asistente:

1. Escribe una entrada estructurada en el `session-log.md` del proyecto
2. **Actualiza el backlog** — marca tareas completadas, agrega nuevas, reordena por prioridad
3. **Actualiza INDEX.md** — refleja la ultima sesion y top 3 del backlog
4. **Escribe log diario** — crea o actualiza `daily/YYYY-MM-DD.md` con resumen consolidado
5. Nota convenciones que se establecieron o cambiaron
6. Confirma que se registro

La siguiente sesion retoma exactamente donde esta termino.

### Skills automaticos

El `CLAUDE.md` del vault incluye reglas que el asistente sigue automaticamente durante cualquier sesion:

- **ADRs automaticos** — Cuando se toma una decision tecnica (arquitectura, stack, patrones), se crea un ADR en `decisions/` sin pedirlo
- **Captura de conocimiento** — Cuando se resuelve un problema tecnico reutilizable, la solucion se guarda en `resources/` por categoria
- **Contexto de areas** — Cuando el usuario pregunta sobre universidad o infraestructura, el asistente lee el INDEX del area correspondiente primero

## Mantenimiento del Vault

```bash
# Agregar archivos faltantes a proyectos existentes tras actualizar mempunk
mempunk sync

# Verificar integridad — proyectos fantasma, archivos faltantes, registros rotos
mempunk doctor
```

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

## Idiomas

Disponibles: **English** (por defecto), **Español**, **Português**, **Français**

Usa `--lang es`, `--lang pt` o `--lang fr` con cualquier comando, o seleccionalo interactivamente durante el setup.

## Licencia

[MIT](LICENSE)
