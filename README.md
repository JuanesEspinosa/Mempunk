# Mempunk

Dev Brain vault — memoria persistente para Claude Code entre sesiones.

Claude Code olvida todo entre sesiones. Este vault es la continuidad: al inicio de cada sesion lee el contexto, al final escribe lo que hizo.

## Quick Start

### 1. Clonar

```bash
git clone https://github.com/tu-usuario/mempunk.git
cd mempunk
```

### 2. Usar directamente

Ejecutar Claude Code desde el directorio del vault:

```bash
claude
```

Claude leera el `CLAUDE.md` automaticamente y seguira los protocolos definidos.

### 3. Acceso cruzado desde otros proyectos

Para que Claude Code acceda al vault mientras trabajas en otro proyecto, agrega el vault como directorio adicional:

**Opcion A — Por sesion (temporal):**

```bash
claude --add-dir "/ruta/a/mempunk"
```

**Opcion B — Permanente (config global):**

Agrega esto a tu `~/.claude.json`:

```json
{
  "additionalDirectories": ["/ruta/a/mempunk"]
}
```

> Reemplaza `/ruta/a/mempunk` con la ruta absoluta donde clonaste el repo.

## Estructura

```
mempunk/
├── CLAUDE.md              # Punto de entrada — Claude lee esto primero
├── projects/              # Un directorio por proyecto activo
├── areas/                 # Responsabilidades continuas (universidad, infra...)
├── resources/             # Conocimiento tecnico reutilizable
└── daily/                 # Session logs diarios
```

### Estructura de cada proyecto

```
projects/nombre-proyecto/
├── overview.md            # Contexto general (leer primero)
├── architecture.md        # Stack y decisiones tecnicas
├── backlog.md             # Tareas pendientes priorizadas
├── decisions/             # Architecture Decision Records
└── session-log.md         # Log de cada sesion de Claude
```

## Como funciona

1. **Inicio de sesion:** Claude lee `CLAUDE.md` > identifica el proyecto > lee overview + session-log + backlog > confirma contexto con el usuario
2. **Durante la sesion:** Claude trabaja con contexto completo de decisiones pasadas
3. **Cierre de sesion:** Claude escribe en el session-log que hizo, que decidio, y que falta

## Compatible con Obsidian

Este vault funciona como boveda de Obsidian. Los archivos son markdown estandar — puedes navegar, buscar y vincular notas visualmente.

## Personalizar

Edita `CLAUDE.md` para ajustar:
- Preferencias de stack y estilo de codigo
- Reglas de comunicacion
- Protocolos de inicio/cierre de sesion
- Plantillas de proyectos nuevos

## Licencia

MIT
