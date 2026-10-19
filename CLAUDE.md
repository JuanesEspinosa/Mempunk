# Mempunk — guía de desarrollo

Este repo es el **código de Mempunk** (paquete npm `mempunk`): un CLI que da memoria persistente entre sesiones a Claude Code, Gemini CLI y opencode, sobre un vault de markdown + SQLite (`~/Dev-Brain`).

Este archivo explica cómo desarrollar Mempunk, no cómo usarlo. Las instrucciones de uso del vault están en `templates/CLAUDE.md` (plantilla del CLAUDE.md del vault) y en `README.md`. Mientras trabajas en este repo, **no guardes nada en el vault real** y no sigas protocolos de "guardar en el vault" pensados para el usuario final.

## Estructura

```
src/
├── cli.js              → punto de entrada (bin) y despacho de comandos
├── commands/*.js       → un módulo por dominio (project, backlog, decision, session, hooks, setup, vault, remote, sync…)
├── lib/                → utilidades del CLI: args.js (flags), i18n.js (mensajes), git.js, vault.js (VAULT_PATH), assets.js, materialize.js…
├── store/VaultStore.js → acceso a SQLite (better-sqlite3), WAL, MIGRATIONS y VAULT_VERSION
├── hooks/*.js          → fuente de los hooks de Claude Code (on-start, on-stop, on-compact, on-prompt, on-end)
├── hooks-lib/common.js → código compartido por los hooks (VAULT_PATH, logger, HOOK_MESSAGES, llamada al CLI)
├── agents/*.md         → subagentes que instala `hooks install`
└── statusline.js       → statusline (medidor de contexto)
scripts/build-hooks.mjs → bundlea src/hooks/ a dist/hooks/ con esbuild
templates/              → plantillas que copia el CLI (CLAUDE.md del vault, project/, vault/ con los README de cada carpeta)
vault-skills/           → protocolos para Gemini CLI y opencode (los copia `setup`)
tests/                  → Jest (ESM con --experimental-vm-modules)
docs/plan-v3.md         → plan de trabajo vigente
```

## Comandos

- `npm run build` — bundlea los hooks a `dist/hooks/`. Lo ejecutan solos `pretest` y `prepack`.
- `npm test` — build + Jest. Los tests de hooks corren contra los **bundles** de `dist/hooks/`, no contra la fuente.
- `npm run lint` — ESLint sobre `src`, `tests` y `scripts`.
- `npm run test:coverage` — c8 con gate del 80% de líneas sobre `src/**`.

Antes de cada commit: `npm test` y `npm run lint` en verde.

## Reglas

**Hooks**
- Se editan en `src/hooks/` y `src/hooks-lib/`. **Nunca edites `dist/`** (está en `.gitignore` y se regenera).
- Los hooks se instalan como archivos autocontenidos en `~/.claude/hooks/`, sin `node_modules`. Por eso **no pueden importar de `src/lib/`, `src/store/` ni de dependencias npm**: solo módulos de Node y `src/hooks-lib/`. Si un hook necesita lógica del CLI, llama a `mempunk` como subproceso (ver `MEMPUNK_CLI` en `common.js`). Si algo se duplica a propósito entre `src/lib/` y `hooks-lib`, déjalo comentado.
- El banner `# mempunk-hook` lo añade el build; `hooks install/uninstall` lo usan para reconocer los archivos de Mempunk.
- Un hook nunca debe romper la sesión: los errores van a `.mempunk/hooks.log` y el hook sale en silencio. El stderr de git nunca se pasa al contexto de Claude (ver `classifyCliFailure`).

**i18n**
- Mensajes del CLI en `src/lib/i18n.js`, en `en` (por defecto) y `es` (`MEMPUNK_LANG=es`). Cada clave nueva va en los dos idiomas.
- Mensajes de los hooks en `HOOK_MESSAGES` de `src/hooks-lib/common.js`, también en los dos idiomas.
- Comandos y opciones nuevas: añadirlos a la ayuda en `i18n.js` y registrar los flags en `src/lib/args.js`.

**Vault y migraciones**
- El esquema del vault se versiona en `MIGRATIONS` de `VaultStore.js`; `VAULT_VERSION` es la última. Un cambio de esquema es una migración nueva, nunca una edición de una existente.
- Las migraciones solo se aplican con `mempunk vault upgrade` explícito. Los demás comandos abortan con un mensaje claro si el vault está desactualizado; nunca migres en silencio.
- Las rutas guardadas en la BD son relativas al vault (desde v6).

**Tests y pruebas manuales**
- Todo test aísla el vault y el home: `MEMPUNK_VAULT` apuntando a un directorio temporal, y `HOME` **y** `USERPROFILE` temporales (Windows usa `USERPROFILE`). Sin eso, `hooks install`, `setup` o la statusline escriben en la instalación real del desarrollador.
- `MEMPUNK_CLI="node <ruta>/src/cli.js"` hace que los hooks llamen al CLI del repo en vez del instalado.
- En pruebas manuales usa también `MEMPUNK_VAULT` con un vault temporal. Nunca apuntes a `~/Dev-Brain`.
- CI corre en Ubuntu, Windows y macOS con Node 22 y 24: cuida rutas (`path.join`, separadores `\`), quoting de shell y finales de línea.

**Código y commits**
- ESM, Node ≥ 22. Código en inglés; comentarios y mensajes en español.
- Commits con Conventional Commits en español: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, con scope opcional (`fix(hooks): …`). Un commit por subtarea.
- Los cambios visibles para el usuario van en `CHANGELOG.md` bajo `[Unreleased]`.

## Plan de trabajo

El plan de trabajo vigente está en `docs/plan-v3.md`. Trabaja una fase por rama.
