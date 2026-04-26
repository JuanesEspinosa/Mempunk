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
Mempunk/
│
├── CLAUDE.md                        ← Estas aqui. Leer primero siempre.
├── .claude/
│   └── commands/                    ← Slash commands reutilizables
│
├── projects/                        ← Un directorio por proyecto activo
│
├── areas/                           ← Responsabilidades continuas (no proyectos)
│   ├── universidad/
│   └── infraestructura/
│
├── resources/                       ← Conocimiento tecnico reutilizable
│
└── daily/                           ← Session logs diarios (Claude escribe aqui)
    └── YYYY-MM-DD.md
```

---

## Estructura interna de cada proyecto

Cada carpeta en `projects/` sigue esta estructura estandar:

```
projects/[nombre-proyecto]/
│
├── overview.md          ← LEER PRIMERO al trabajar en este proyecto
├── architecture.md      ← Stack, decisiones tecnicas, diagramas
├── backlog.md           ← Tareas pendientes priorizadas
├── decisions/           ← ADRs (Architecture Decision Records)
│   └── YYYY-MM-DD-titulo.md
└── session-log.md       ← Claude escribe aqui al terminar cada sesion
```

---

## Protocolo de inicio de sesion

**Al comenzar cualquier sesion, Claude DEBE:**

1. Leer este archivo (`CLAUDE.md`) completo
2. Identificar en que proyecto(s) se va a trabajar
3. Leer el `overview.md` del proyecto relevante
4. Leer las ultimas **3 entradas** del `session-log.md` de ese proyecto
5. Leer el `backlog.md` para entender prioridades actuales
6. Confirmar al usuario: *"Lei el contexto de [proyecto]. Ultimo trabajo fue [resumen]. Continuamos con [X] o hay algo nuevo?"*

**Nunca empezar a escribir codigo sin haber hecho estos pasos.**

---

## Protocolo de cierre de sesion

**Al terminar cualquier sesion de trabajo, Claude DEBE escribir en
`projects/[proyecto]/session-log.md`:**

```markdown
## Sesion YYYY-MM-DD HH:MM

### Que se hizo
- [lista concisa de cambios realizados]

### Decisiones tomadas
- [decisiones arquitecturales o tecnicas relevantes]

### Estado actual
- [estado en que quedo el codigo/feature]

### Proximos pasos
- [que falta, en orden de prioridad]

### Archivos modificados
- [lista de archivos tocados]
```

Este log es critico. Sin el, la proxima sesion empieza desde cero.

---

## Proyectos activos

*Ninguno registrado aun. Usar el protocolo de nuevo proyecto para agregar.*

---

## Como navegar este vault

### Cuando el usuario pide trabajar en un proyecto:
1. Ir a `projects/[nombre]/overview.md`
2. Si no existe el overview, preguntar al usuario y crearlo
3. Nunca asumir contexto — siempre leer primero

### Cuando el usuario pregunta algo tecnico generico:
- Buscar en `resources/` si hay una nota relevante
- Si no existe, considerar crearla para futuras sesiones

### Cuando hay dudas sobre una decision pasada:
- Revisar `projects/[nombre]/decisions/`
- Si no hay un ADR, preguntar al usuario antes de asumir

### Cuando se trabaja en algo de universidad:
- Contexto en `areas/universidad/`

---

## Preferencias y configuracion del usuario

### Stack preferido
- **Backend:** NestJS (TypeScript)
- **Frontend:** Next.js / React
- **Desktop:** Electron
- **Base de datos:** PostgreSQL
- **Deploy:** Dokploy sobre VPS
- **OS:** Debian Trixie (hostname: `Juanes`, user: `juanes`)
- **IDE:** Cursor + Claude Code

### Estilo de codigo
- TypeScript estricto
- Modular, con separacion clara de responsabilidades
- Comentarios en espanol para logica de negocio
- Nombres de variables/funciones en ingles

### Comunicacion
- Respuestas directas y concisas
- Si hay varias opciones, presentar maximo 3 con trade-offs claros
- Preguntar antes de hacer cambios destructivos o irreversibles
- Confirmar entendimiento del contexto al inicio de sesion

---

## Como crear un nuevo proyecto

Cuando se empiece a trabajar en un proyecto nuevo, Claude debe:

1. Crear la carpeta `projects/[nombre]/`
2. Crear `overview.md` con la plantilla estandar
3. Crear `backlog.md` vacio
4. Crear `session-log.md` vacio
5. Agregar el proyecto a la seccion "Proyectos activos" de este `CLAUDE.md`

---

## Reglas que Claude NO debe romper

1. **Nunca modificar codigo de produccion sin confirmacion explicita del usuario**
2. **Nunca almacenar credenciales, API keys, o contrasenas en el vault**
3. **Nunca saltarse el protocolo de inicio de sesion** — aunque el usuario pida ir directo al codigo
4. **Nunca asumir que proyecto es relevante** — preguntar si hay ambiguedad
5. **Siempre escribir el session-log al terminar** — aunque el usuario no lo pida

---

*Vault inicializado: ver `daily/` para historial de sesiones.*
