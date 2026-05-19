# Cierre de sesión

Ejecuta estos pasos al terminar. Si ya hiciste saves incrementales durante la sesión, este proceso es rápido — solo consolida lo que ya existe.

---

## Paso 1 — Actualiza el backlog

Por cada tarea que cambió de estado durante la sesión, ejecuta:

```
mempunk backlog update <id> --status <done|in_progress|pending>
```

Solo las que cambiaron. No toques las que siguen igual.

---

## Paso 2 — Captura decisiones pendientes

Si tomaste alguna decisión arquitectural importante durante la sesión y no la guardaste en el momento, guárdala ahora:

```
mempunk decision add <project_id> "<título de la decisión>"
```

Si ya la guardaste con un save incremental, no la dupliques.

---

## Paso 3 — Registra la sesión

```
mempunk session log <project_id> "<summary>" --files "path1,path2,path3"
```

### Formato del summary

Escribe en este orden, separado por puntos:
1. Qué se hizo
2. Qué decisiones se tomaron (si no se guardaron como decisión individual)
3. Qué quedó pendiente

Ejemplo:
```
"Implementado endpoint de autenticación con JWT. Decidido usar refresh tokens en cookie httpOnly. Pendiente: tests de integración y manejo de expiración."
```

### Cómo construir --files

Incluye solo los archivos que efectivamente modificaste en esta sesión. No incluyas archivos que solo leíste. Usa rutas relativas al proyecto cuando sea posible.

---

## Reglas

- **No reescribas** lo que ya guardaste con saves incrementales durante la sesión.
- El session log es el resumen final, no la única fuente de verdad.
- Si la sesión fue corta y no hubo cambios significativos, el summary puede ser una sola línea.
