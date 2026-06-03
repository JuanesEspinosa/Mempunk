# Flujo del backlog

---

## Cuándo agregar una tarea

Agrega una tarea al backlog solo si cumple ambas condiciones:

1. Tiene entidad propia — no es un paso dentro de otra tarea mayor
2. Tomará más de 10 minutos completarla

No agregues tareas triviales, recordatorios de corto plazo ni cosas que resolverás en la misma sesión.

```
mempunk backlog add <project_id> "<título descriptivo>" --priority <1|2|3>
```

---

## Escala de prioridad

| Valor | Significado |
|-------|-------------|
| `1`   | Urgente o bloqueante — debe resolverse antes de continuar |
| `2`   | Normal — se trabaja en el orden natural del proyecto |
| `3`   | Cuando haya tiempo — nice-to-have, deuda técnica, mejoras |

Si no sabes qué prioridad asignar, usa `2`.

---

## Cuándo actualizar el status

Actualiza **inmediatamente**, no al final de la sesión:

- Al **empezar** a trabajar en una tarea:
```
mempunk backlog update <id> --status in_progress
```

- Al **terminar** una tarea:
```
mempunk backlog update <id> --status done
```

- Si una tarea en progreso se detiene sin terminar, déjala en `in_progress`. Solo vuelve a `pending` si se descarta y se retomará desde cero.

---

## Cómo manejar subtareas

No existe un tipo "subtarea" — crea ítems separados con títulos que referencien la tarea padre.

Ejemplo para la tarea "Implementar autenticación":
```
mempunk backlog add <proj> "Autenticación: endpoint POST /login"
mempunk backlog add <proj> "Autenticación: middleware de validación de token"
mempunk backlog add <proj> "Autenticación: tests de integración"
```

Así cada ítem es independiente, trazable y puede cambiar de estado por separado.

---

## Al revisar el backlog al inicio de sesión

Carga las tareas pendientes con:
```
mempunk backlog list <project_id> --status pending
```

Identifica cuáles están en `in_progress` — esas son las que quedaron a medias en la sesión anterior. Retómalas antes de empezar algo nuevo, a menos que el usuario indique lo contrario.
