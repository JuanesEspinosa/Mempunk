[English](README.md) | [Español](README.es.md)

# Mempunk

Cerebro persistente para Claude Code — vault de memoria entre sesiones.

Claude Code olvida todo entre sesiones. Mempunk es la continuidad: lee el contexto al inicio, escribe lo que hizo al final.

## Inicio rapido

```bash
# 1. Crear y vincular vault
npx mempunk

# 2. Agregar un proyecto
npx mempunk project mi-app

# 3. En cualquier sesion de Claude Code, escribe:
/mempunk
```

Eso es todo. Claude carga el vault, ve tus proyectos y retoma donde quedo.

## CLI

```
mempunk setup                  Setup interactivo completo (recomendado)
mempunk init [ruta] [opciones] Crear un nuevo vault
mempunk project <nombre>       Agregar un nuevo proyecto al vault
mempunk link <ruta>            Vincular vault a Claude Code
mempunk unlink                 Desvincular vault de Claude Code
mempunk status                 Mostrar vault vinculado actual
mempunk help                   Mostrar este mensaje
```

### Opciones de init

```bash
--lang <codigo>    Idioma: en, es (por defecto: en)
--preset <nombre>  Preset: full, standard, minimal
--projects         Incluir carpeta projects
--areas            Incluir carpeta areas
--resources        Incluir carpeta resources
--daily            Incluir carpeta daily
```

### Ejemplos

```bash
# Setup interactivo en espanol
mempunk setup --lang es

# Crear vault con preset
mempunk init ./vault --preset full

# Elegir carpetas especificas
mempunk init ./vault --projects --resources --daily

# Agregar proyectos
mempunk project mi-saas
mempunk project app-movil

# Vincular vault existente
mempunk link ./mi-vault

# Ver que esta vinculado
mempunk status
```

## Agregar proyectos

```bash
mempunk project arion-colombia
```

Este comando:
1. Crea la estructura completa del proyecto dentro del vault
2. Registra el proyecto en `CLAUDE.md` con un link directo
3. Conecta todos los archivos con `[[wikilinks]]` de Obsidian

Despues de agregar un proyecto, Claude sabe que existe y puede navegar directamente a el sin escanear todas las carpetas.

## Estructura del vault

```
vault/
├── CLAUDE.md              # Punto de entrada — Claude lee esto primero
├── projects/              # Un directorio por proyecto activo
│   └── mi-proyecto/
│       ├── overview.md    # Contexto general (leer primero)
│       ├── architecture.md # Stack y decisiones tecnicas
│       ├── backlog.md     # Tareas pendientes priorizadas
│       ├── session-log.md # Log de cada sesion de Claude
│       └── decisions/     # Architecture Decision Records
├── areas/                 # Responsabilidades continuas
├── resources/             # Conocimiento tecnico reutilizable
└── daily/                 # Logs de sesion diarios
```

## Como funciona

1. **Setup:** `npx mempunk` — elige idioma, ubicacion y estructura
2. **Agregar proyectos:** `mempunk project <nombre>` — crea y registra cada proyecto
3. **Usar:** Escribe `/mempunk` en cualquier sesion de Claude Code
4. **Inicio de sesion:** Claude lee `CLAUDE.md`, ve el indice de proyectos, lee el overview + session-log + backlog relevante, y confirma contexto
5. **Fin de sesion:** Claude escribe que hizo, que decidio y que falta en el session-log

## El comando `/mempunk`

Durante el setup, se instala un slash command global en `~/.claude/skills/mempunk/`. En cualquier sesion de Claude Code, escribe `/mempunk` y Claude:

1. Lee el `CLAUDE.md` del vault
2. Lista tus proyectos activos
3. Pregunta en cual quieres trabajar
4. Carga el contexto completo de ese proyecto

Sin necesidad de copiar prompts o recordar rutas.

## Idiomas

Actualmente disponibles:

- **English** (por defecto)
- **Espanol**

Usa `--lang es` con cualquier comando, o seleccionalo interactivamente durante el setup.

## Compatible con Obsidian

Todos los archivos usan `[[wikilinks]]` — la vista de grafo muestra conexiones entre CLAUDE.md, overviews de proyectos, backlogs, docs de arquitectura y session logs.

## Personalizar

Edita `CLAUDE.md` para ajustar:
- Preferencias de stack y estilo de codigo
- Reglas de comunicacion
- Protocolos de inicio/cierre de sesion

## Licencia

MIT
