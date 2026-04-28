[English](README.md) | [Español](README.es.md) | [Português](README.pt.md) | [Français](README.fr.md)

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

- **Inicio de sesion** (`/mempunk`): Claude lee el vault, ve tus proyectos, carga el overview relevante, las convenciones, los ultimos session logs y el backlog. Retoma donde quedaste.
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
mempunk link <ruta>            Vincular un vault a Claude Code (soporta multiples)
mempunk unlink [ruta]          Desvincular un vault (interactivo si hay varios)
mempunk status                 Mostrar todos los vaults vinculados y sus proyectos
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
```

## Estructura del Vault

```
vault/
├── CLAUDE.md              # Punto de entrada — Claude lee esto primero
├── projects/
│   └── mi-proyecto/
│       ├── overview.md    # Que es el proyecto, stack, repo, estado
│       ├── architecture.md # Decisiones tecnicas y diagramas
│       ├── conventions.md # Reglas del proyecto, estandares de codigo, patrones
│       ├── backlog.md     # Tareas priorizadas (- [ ] / - [x])
│       ├── session-log.md # Que hizo Claude en cada sesion
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas (no proyectos)
├── resources/             # Conocimiento tecnico reutilizable
└── daily/                 # Logs de sesion diarios
```

`mempunk project <nombre>` crea esta estructura y registra el proyecto en `CLAUDE.md` con un `[[wikilink]]` directo.

`mempunk sync` agrega archivos de template faltantes (como `conventions.md`) a proyectos existentes sin sobreescribir.

## Flujo de Sesion

### Inicio: `/mempunk`

Se instala globalmente en `~/.claude/skills/mempunk/` durante el setup. Al escribir `/mempunk` en cualquier sesion de Claude Code, Claude:

1. Descubre todos los vaults vinculados automaticamente
2. Si hay multiples vaults, pregunta cual usar
3. Lee el `CLAUDE.md` del vault y el indice de proyectos
4. Pregunta en cual proyecto quieres trabajar
5. Lee el overview y las convenciones del proyecto
6. Lee los ultimos 3 session logs y el backlog
7. Confirma el contexto antes de continuar

### Cierre: `/session-end`

Se instala globalmente en `~/.claude/skills/session-end/`. Al escribir `/session-end`, Claude:

1. Identifica en que proyecto se trabajo
2. Escribe una entrada estructurada en el `session-log.md` del proyecto
3. Incluye: que se hizo, decisiones, estado actual, proximos pasos, archivos modificados
4. Nota convenciones que se establecieron o cambiaron
5. Confirma que se registro

La siguiente sesion retoma exactamente donde esta termino.

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

## Compatible con Obsidian

Todos los archivos usan `[[wikilinks]]`. Abre el vault en Obsidian y la vista de grafo muestra las conexiones entre `CLAUDE.md`, overviews, backlogs, docs de arquitectura, convenciones y session logs.

## Idiomas

Disponibles: **English** (por defecto), **Español**, **Português**, **Français**

Usa `--lang es`, `--lang pt` o `--lang fr` con cualquier comando, o seleccionalo interactivamente durante el setup.

## Licencia

[MIT](LICENSE)
