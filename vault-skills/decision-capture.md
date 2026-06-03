# Captura de decisiones

---

## Cuándo guardar una decisión

Guarda la decisión si afecta alguno de estos aspectos del proyecto:

- **Arquitectura**: estructura de módulos, separación de capas, flujo de datos
- **Stack**: agregar, quitar o cambiar una dependencia o tecnología
- **Patrones**: adoptar o abandonar un patrón de diseño, una convención de código
- **Infraestructura**: cambios en deploy, base de datos, servicios externos

**No guardes** si es:
- Un fix puntual de bug sin implicaciones de diseño
- Un cambio cosmético (renombrar variable, reformatear código)
- Una decisión ya obvia dado el stack del proyecto

En caso de duda, guárdala. Es más barato tener una decisión de más que perder contexto.

---

## Cuándo ejecutar el comando

**Inmediatamente** al tomar la decisión, no al final de la sesión.

```
mempunk decision add <project_id> "<título conciso>"
mempunk decision add <project_id> "<título conciso>" --tags "tag1,tag2"
```

El comando crea el archivo markdown y lo registra en la BD en una sola operación.

---

## Formato del archivo markdown

El archivo se crea con secciones vacías. Rellena las tres secciones antes de continuar:

```markdown
## Contexto

[Por qué surgió esta decisión. Qué problema resuelve. Qué restricciones existían.]

## Decisión

[Qué se decidió, de forma concisa y específica.]

## Consecuencias

[Qué implica esta decisión hacia adelante. Qué se habilita y qué se descarta.]
```

Escribe lo mínimo necesario para que tenga sentido en una sesión futura sin contexto. No escribas ensayos.

---

## Tags recomendados

Usa tags cortos y consistentes entre proyectos:

`auth`, `database`, `api`, `frontend`, `deploy`, `testing`, `patterns`, `security`, `performance`, `dependencies`
