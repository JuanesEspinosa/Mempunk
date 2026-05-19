# Gestión de skills

Los skills son archivos markdown que almacenan contexto recurrente de un proyecto. Se cargan al inicio de cada sesión y reemplazan la necesidad de re-explicar el stack y las convenciones.

---

## Qué va en cada skill estándar

### `stack.md`
- Tecnologías principales con sus versiones
- Configuraciones no obvias que afectan el desarrollo
- Dependencias clave y por qué se eligieron
- URLs de entornos (staging, producción, base de datos) si son relevantes

### `patterns.md`
- Patrones arquitecturales adoptados en el proyecto
- Estructura de carpetas y qué va en cada una
- Cómo se organiza el código (módulos, capas, features)
- Decisiones de diseño que se repiten en todo el proyecto

### `conventions.md`
- Naming de variables, funciones, archivos y carpetas
- Formato de commits (prefijos, estructura del mensaje)
- Reglas específicas de código que no están en el linter
- Estilo de código que el equipo acordó explícitamente

---

## Cuándo crear un skill nuevo

Crea un skill cuando tengas contexto recurrente que no encaja en los tres anteriores. Ejemplos válidos:

- `testing.md` → si el proyecto tiene una estrategia de tests no obvia
- `api-contracts.md` → si hay contratos con sistemas externos que se consultan frecuentemente
- `deployment.md` → si el proceso de deploy tiene pasos no estándar

No crees un skill para contexto de una sola sesión. Si el contexto no va a ser útil en la próxima sesión, no merece un skill.

---

## Cuándo actualizar vs crear

- **Si el skill ya existe**: siempre actualiza con `mempunk skill update`. Nunca crees un segundo skill con el mismo propósito.
- **Si el skill no existe**: crea uno con `mempunk skill add`.

### Flujo de actualización

1. Edita el archivo en `file_path` con el contenido nuevo
2. Ejecuta:
```
mempunk skill update <id> --file <file_path>
```

Actualiza inmediatamente cuando el contexto cambia, no al final de la sesión.

---

## Regla de oro

Un skill debe poder leerse en menos de 30 segundos y dar contexto suficiente para trabajar. Si se vuelve muy largo, divídelo en dos skills con nombres específicos.
