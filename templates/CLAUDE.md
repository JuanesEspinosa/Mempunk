# CLAUDE.md — Dev Brain (Vault Global)

> Este archivo es el punto de entrada para Claude Code en este vault.
> Leelo completo antes de hacer cualquier accion. Contiene la arquitectura,
> las reglas de navegacion, y los protocolos de cada proyecto.

---

## Que es este vault

Este vault es el cerebro centralizado de todos los proyectos de desarrollo activos.
No es un repo de codigo — es la memoria persistente entre sesiones de Claude Code.

**Principio fundamental:** Claude Code olvida todo entre sesiones. Este vault es la
continuidad. Al inicio de cada sesion, Claude lee el contexto relevante aqui.
Al final, escribe lo que hizo.

---

## Estructura del vault

```
vault/
├── CLAUDE.md              # Estas aqui. Leer primero siempre.
├── projects/              # Un directorio por proyecto activo
├── areas/                 # Responsabilidades continuas
│   └── INDEX.md           # Indice de areas
├── resources/             # Conocimiento tecnico reutilizable
│   └── INDEX.md           # Indice de recursos
└── daily/                 # Session logs diarios
    └── INDEX.md           # Indice de logs diarios
```

---

## Estructura interna de cada proyecto

Cada carpeta en `projects/` sigue esta estructura estandar:

```
projects/[nombre-proyecto]/
├── INDEX.md             # Punto de entrada — leer primero
├── overview.md          # Descripcion completa del proyecto
├── architecture.md      # Stack, decisiones tecnicas, diagramas
├── conventions.md       # Reglas, estandares y convenciones de codigo
├── backlog.md           # Tareas pendientes priorizadas
├── decisions/           # ADRs (Architecture Decision Records)
│   └── YYYY-MM-DD-titulo.md
├── session-log.md       # Claude escribe aqui al terminar cada sesion
└── wiki/                # Wiki del proyecto (estado compilado, log, fuentes)
```

---

## Proyectos activos

<!-- MEMPUNK:PROJECTS:START -->
*Ninguno registrado aun. Usa `mempunk project <nombre>` para agregar.*
<!-- MEMPUNK:PROJECTS:END -->

---

## Protocolo de inicio de sesion

> **Primero: verifica si tienes agentes instalados.**
> Ejecuta `mempunk hooks install --check` o busca `@mempunk-loader` en tus agentes.

### Camino A — Con agentes (Claude Code modo automatico)

Si el agente `@mempunk-loader` esta disponible, **invocalo directamente**.
El agente maneja la seleccion de proyecto, activacion y carga de contexto completa.
No sigas el protocolo manual — seria redundante.

Si configuraste `auto-start`, el agente ya se habra invocado automaticamente al
abrir esta sesion. Solo confirma el proyecto y continua.

### Camino B — Sin agentes (modo manual, Gemini CLI, opencode)

**Al comenzar cualquier sesion, Claude DEBE:**

1. Leer este archivo (`CLAUDE.md`) completo
2. Listar los proyectos registrados en la seccion **Proyectos activos** de este CLAUDE.md
3. Preguntarle al usuario: *"Encontre estos proyectos: [lista]. Con cual trabajamos hoy?"*
4. Ejecutar `mempunk project activate <id>` para activar el proyecto elegido (agrega `--here` si estas en la carpeta del repo, para que los checkpoints se resuelvan por directorio)
5. Leer el `INDEX.md` del proyecto
6. Leer el `overview.md` completo de ese proyecto
7. Verificar si existe `wiki/state.md` en el proyecto:
   - Si **existe**: leer `wiki/state.md` (estado compilado — reemplaza leer el session-log)
   - Si **no existe**: leer las ultimas **3 entradas** del `session-log.md`
8. Leer las tareas pendientes: `mempunk backlog list <id> --status pending`
9. Leer el `conventions.md` del proyecto (si existe)
10. Confirmar al usuario: *"Lei el contexto de [proyecto]. Ultimo trabajo fue [resumen]. Continuamos con [X] o hay algo nuevo?"*

**Nunca asumir el proyecto — siempre preguntar primero.**
**Nunca leer archivos de un proyecto antes de que el usuario lo confirme.**
**Nunca empezar a escribir codigo sin haber hecho estos pasos.**

---

## Protocolo de cierre de sesion

> Si tienes `@mempunk-saver` disponible, puedes usarlo para el guardado.
> De lo contrario, sigue el protocolo manual.

### Cierre manual

**Al terminar cualquier sesion de trabajo, Claude DEBE:**

1. Actualizar tareas que cambiaron de estado: `mempunk backlog update <id> --status done`
2. Registrar decisiones tecnicas tomadas: `mempunk decision add <project_id> "<titulo>"`
3. Registrar la sesion: `mempunk session log <project_id> "<resumen>" --files "arch1,arch2"`
4. Actualizar el `INDEX.md` del proyecto con la ultima sesion y top 3 del backlog
5. Actualizar `wiki/state.md` si existe — reescribir con estado compilado y agregar linea al `wiki/log.md`
6. Escribir o actualizar `daily/YYYY-MM-DD.md` (ver skill: Daily consolidado)

---

## Skills automaticos

### ADRs automaticos

Si durante cualquier sesion se toma una decision tecnica que afecte arquitectura, stack, patrones de codigo, o infraestructura — Claude debe crear automaticamente un ADR en `projects/[nombre]/decisions/YYYY-MM-DD-titulo.md` sin esperar a que el usuario lo pida.

Formato del ADR:

```markdown
# YYYY-MM-DD — [Titulo de la decision]

## Contexto
[Por que surgio esta decision]

## Decision
[Que se decidio]

## Alternativas consideradas
[Que otras opciones habia]

## Consecuencias
[Que implica esta decision a futuro]
```

Despues de crear el ADR, actualizar el `INDEX.md` del proyecto con una mencion en la seccion de ultima sesion.

### Captura de conocimiento en resources/

Si Claude resuelve durante la sesion un problema que probablemente se repita (configurar algo en Debian, un patron de NestJS, un workaround de Dokploy, una configuracion de PostgreSQL, etc.), debe guardarlo en `resources/[categoria]/titulo.md` automaticamente.

Categorias: `debian/`, `nestjs/`, `nextjs/`, `electron/`, `dokploy/`, `postgresql/`, `general/`

Antes de resolver un problema tecnico generico, buscar primero en [[resources/INDEX|Resources]] si ya existe una nota relevante.

### Backlog inteligente

Al escribir el session-log al final de cada sesion, Claude tambien debe actualizar el `backlog.md` del proyecto:
- Marcar como completado `[x]` lo que se hizo en la sesion
- Agregar al backlog las tareas nuevas que surgieron
- Reordenar por prioridad si cambio algo relevante

Despues de actualizar el backlog, reflejar el top 3 actualizado en el `INDEX.md` del proyecto.

### Daily consolidado

Al cerrar la sesion, ademas del session-log por proyecto, Claude debe escribir o actualizar `daily/YYYY-MM-DD.md` con este formato:

```markdown
# YYYY-MM-DD

## Proyectos trabajados
- **[proyecto]:** [una linea de lo que se hizo]

## Decisiones del dia
- [decisiones relevantes tomadas]

## Resumen ejecutivo
[2-3 lineas de lo mas importante del dia]
```

Si ya existe la entrada del dia (porque hubo otra sesion antes), agregar debajo sin borrar lo anterior.

### Contexto de areas/

- Si el usuario pide algo relacionado con universidad, leer `areas/universidad/INDEX.md` antes de responder
- Si el usuario pide algo relacionado con infraestructura, VPS, Dokploy, o servidores, leer `areas/infraestructura/INDEX.md` antes de responder

---

## Como navegar este vault

**Regla fundamental:** nunca ir directo a un archivo interno. Siempre entrar por el INDEX.md correspondiente y seguir el enlace desde ahi.

### Para trabajar en un proyecto:
1. Ir al INDEX.md del proyecto (enlazado en "Proyectos activos" arriba)
2. Decidir si profundizar → seguir enlace a `overview.md` desde el INDEX
3. Acceder a backlog, architecture, session-log solo via los enlaces del INDEX

### Para decisiones tecnicas:
- Crear ADR automaticamente en `projects/[nombre]/decisions/`

### Para problemas tecnicos genericos:
- Buscar en [[resources/INDEX|Resources]] primero
- Si no existe una nota relevante, guardar la solucion para futuras sesiones

### Para contexto de areas:
- Ir a [[areas/INDEX|Areas]] y seguir el enlace al area correspondiente

### Para historial del dia:
- Ir a [[daily/INDEX|Daily]] y buscar la entrada del dia

---

## Preferencias (personalizar)

<!-- MEMPUNK:PREFS:START -->
### Stack preferido
- **Backend:**
- **Frontend:**
- **Base de datos:**
- **Deploy:**

### Estilo de codigo
- Modular, con separacion clara de responsabilidades

### Comunicacion
- Respuestas directas y concisas
- Preguntar antes de hacer cambios destructivos o irreversibles
- Confirmar entendimiento del contexto al inicio de sesion
<!-- MEMPUNK:PREFS:END -->

---

## Reglas que Claude NO debe romper

1. **Nunca modificar codigo de produccion sin confirmacion explicita del usuario**
2. **Nunca almacenar credenciales, API keys, o contrasenas en el vault**
3. **Nunca saltarse el protocolo de inicio de sesion**
4. **Nunca asumir que proyecto es relevante** — preguntar si hay ambiguedad
5. **Siempre escribir el session-log al terminar**
6. **Siempre actualizar backlog e INDEX.md al cerrar sesion**
7. **Siempre crear ADR cuando se tome una decision tecnica relevante**
