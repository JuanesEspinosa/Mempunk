# Inicio de sesión

Si los hooks están instalados (`mempunk hooks install`), los pasos de inicio y cierre se ejecutan automáticamente. Verifica con `mempunk hooks install --check` si están activos.

Ejecuta estos comandos en orden antes de escribir una sola línea de código o responder al usuario.

---

## Paso 1 — Última sesión

```
mempunk session last <project_id>
```

Lee el output completo. Extrae:
- Qué se hizo en la sesión anterior (campo `summary`)
- Qué archivos se tocaron (campo `files_touched`)
- Cuándo fue (campo `ended_at`)

**Si el comando retorna "No hay sesiones registradas":** es la primera sesión del proyecto. Salta al paso 4 en lugar del paso 3.

---

## Paso 2 — Skills del proyecto

```
mempunk skill list <project_id>
```

Para cada skill que aparezca en la tabla, lee el archivo en `file_path`:

```
Read <file_path>
```

Carga ese contexto antes de continuar. Los skills contienen el stack, los patrones y las convenciones del proyecto — son más importantes que el session log.

**Si no hay skills:** continúa. No hay contexto de proyecto que cargar todavía.

---

## Paso 3 — Tareas pendientes

```
mempunk backlog list <project_id> --status pending
```

Revisa qué tareas están abiertas. No hagas nada con ellas todavía — solo cárgalas como contexto para cuando el usuario indique qué trabajar.

---

## Paso 4 — Primera sesión del proyecto

Si `session last` no retornó nada, ejecuta:

```
mempunk sync --project <project_id>
```

Revisa el output:
- Si hay `unregistered_files`: hay archivos en disco sin registro en la BD. Infórmale al usuario.
- Si hay `missing_files`: hay registros en la BD sin archivo en disco. Infórmale al usuario.
- Si dice "Vault sincronizado correctamente": el estado inicial está limpio, continúa.

---

## Reglas

- **No leas INDEX.md** a menos que el usuario lo pida explícitamente.
- Usa `mempunk search "<término>"` si necesitas encontrar algo específico en el vault.
- No preguntes al usuario qué cargar — carga todo lo anterior en silencio y luego responde.
