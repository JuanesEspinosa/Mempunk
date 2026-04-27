[English](README.md) | [Español](README.es.md)

# Mempunk

[![npm version](https://img.shields.io/npm/v/mempunk)](https://www.npmjs.com/package/mempunk)
[![license](https://img.shields.io/npm/l/mempunk)](LICENSE)

Cerebro persistente para Claude Code — un vault de markdown que sobrevive entre sesiones.

## El Problema

Claude Code no tiene memoria entre sesiones. Cada vez que inicias una conversacion nueva, no sabe:

- En que estabas trabajando ayer
- Que decisiones de arquitectura ya se tomaron
- Que tareas estan pendientes o completadas
- Que archivos se modificaron y por que
- Cuales eran los proximos pasos

Terminas repitiendo contexto, re-explicando decisiones y perdiendo impulso. Mientras mas largo es el proyecto, peor se pone.

## La Solucion

Mempunk es un vault de markdown estructurado que funciona como la memoria persistente de Claude. Trabaja en dos momentos:

- **Inicio de sesion** (`/mempunk`): Claude lee el vault, ve tus proyectos, carga el overview relevante, los ultimos session logs y el backlog. Retoma donde quedaste.
- **Fin de sesion** (`/session-end`): Claude escribe que hizo, que decisiones se tomaron, que falta y que archivos se tocaron. La siguiente sesion arranca con contexto completo.

El vault son archivos markdown organizados por proyecto. Tu lo gestionas con un CLI. Claude lo navega con slash commands. Tambien funciona como vault de Obsidian, asi que puedes navegar y buscar todo visualmente.

Sin base de datos. Sin servidor. Sin API keys. Solo archivos.

## Inicio Rapido

```bash
# 1. Crear y vincular un vault
npx mempunk

# 2. Agregar un proyecto
npx mempunk project mi-app

# 3. En cualquier sesion de Claude Code, escribe:
/mempunk

# 4. Cuando termines, escribe:
/session-end
```

## Referencia del CLI

### Gestion del vault

```
mempunk setup                  Setup interactivo completo (recomendado)
mempunk init [ruta] [opciones] Crear un nuevo vault
mempunk link <ruta>            Vincular vault a Claude Code (config global)
mempunk unlink                 Desvincular vault de Claude Code
mempunk status                 Dashboard del vault con info de proyectos
mempunk -v                     Mostrar version
```

### Gestion de proyectos

```
mempunk project <nombre>       Agregar un nuevo proyecto al vault
mempunk backlog <nombre>       Ver el backlog de un proyecto en terminal
mempunk log <nombre>           Abrir el session log en tu editor
```

### Opciones

```
--lang <codigo>    Idioma: en, es (por defecto: en)
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
mempunk backlog mi-saas
mempunk log mi-saas
mempunk status
```

## Estructura del Vault

```
vault/
├── CLAUDE.md              # Punto de entrada — Claude lee esto primero
├── projects/
│   └── mi-proyecto/
│       ├── overview.md    # Que es el proyecto, stack, repo, estado
│       ├── architecture.md # Decisiones tecnicas y diagramas
│       ├── backlog.md     # Tareas priorizadas (- [ ] / - [x])
│       ├── session-log.md # Que hizo Claude en cada sesion
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas (no proyectos)
├── resources/             # Conocimiento tecnico reutilizable
└── daily/                 # Logs de sesion diarios
```

`mempunk project <nombre>` crea esta estructura y registra el proyecto en `CLAUDE.md` con un `[[wikilink]]` directo.

## Flujo de Sesion

### Inicio: `/mempunk`

Se instala globalmente en `~/.claude/skills/mempunk/` durante el setup. Al escribir `/mempunk` en cualquier sesion de Claude Code, Claude:

1. Lee el `CLAUDE.md` del vault
2. Ve el indice de proyectos con links directos
3. Pregunta en cual proyecto quieres trabajar
4. Lee el overview, los ultimos 3 session logs, y el backlog
5. Confirma el contexto antes de continuar

### Cierre: `/session-end`

Se instala globalmente en `~/.claude/skills/session-end/`. Al escribir `/session-end`, Claude:

1. Identifica en que proyecto se trabajo
2. Escribe una entrada estructurada en el `session-log.md` del proyecto
3. Incluye: que se hizo, decisiones, estado actual, proximos pasos, archivos modificados
4. Confirma que se registro

La siguiente sesion retoma exactamente donde esta termino.

## Compatible con Obsidian

Todos los archivos usan `[[wikilinks]]`. Abre el vault en Obsidian y la vista de grafo muestra las conexiones entre `CLAUDE.md`, overviews, backlogs, docs de arquitectura y session logs.

## Idiomas

Disponibles: **English** (por defecto), **Español**

Usa `--lang es` con cualquier comando, o seleccionalo interactivamente durante el setup.

## Licencia

[MIT](LICENSE)
