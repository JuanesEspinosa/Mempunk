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
├── resources/             # Conocimiento tecnico reutilizable
└── daily/                 # Session logs diarios
```

---

## Estructura interna de cada proyecto

Cada carpeta en `projects/` sigue esta estructura estandar:

```
projects/[nombre-proyecto]/
├── overview.md          # LEER PRIMERO al trabajar en este proyecto
├── architecture.md      # Stack, decisiones tecnicas, diagramas
├── backlog.md           # Tareas pendientes priorizadas
├── decisions/           # ADRs (Architecture Decision Records)
│   └── YYYY-MM-DD-titulo.md
└── session-log.md       # Claude escribe aqui al terminar cada sesion
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

---

## Proyectos activos

*Ninguno registrado aun. Usar el protocolo de nuevo proyecto para agregar.*

---

## Preferencias (personalizar)

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

---

## Reglas que Claude NO debe romper

1. **Nunca modificar codigo de produccion sin confirmacion explicita del usuario**
2. **Nunca almacenar credenciales, API keys, o contrasenas en el vault**
3. **Nunca saltarse el protocolo de inicio de sesion**
4. **Nunca asumir que proyecto es relevante** — preguntar si hay ambiguedad
5. **Siempre escribir el session-log al terminar**
