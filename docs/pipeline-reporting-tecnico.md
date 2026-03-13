# Documentación técnica final del pipeline de reportes

## Componentes

1. **RPC de consolidación mensual**: `get_attendance_report_monthly`.
2. **Pipeline asíncrono**: Edge Function `generate-monthly-report`.
3. **Registro de ejecuciones**: tabla `report_runs`.
4. **Versionado de reglas**: `attendance_rule_versions`.
5. **Snapshots diarios**: `attendance_daily_facts` + `snapshot-daily-facts`.
6. **UI operativa**: `ReportRunsCard` (estado, reuse de artefactos, KPIs 30d).

## Flujo end-to-end

1. Usuario lanza generación desde UI.
2. `generate-monthly-report` crea run en `report_runs` (`running`).
3. Invoca RPC mensual y obtiene filas.
4. Genera CSV + checksum SHA-256.
5. Persiste artefacto en `monthly-reports`.
6. Actualiza run (`completed|failed`) con métricas (`row_count`, `retry_count`, `duration_ms`).
7. Emite evento de auditoría en `audit_log`.

## Modelo de datos operativo

### report_runs
Campos clave para operación:
- estado (`queued/running/completed/failed`)
- trazabilidad (`filters`, `rules_version`, `rule_version_id`, `rules_params`)
- rendimiento (`duration_ms`, `retry_count`)
- evidencia (`checksum`, `artifact_bucket`, `artifact_path`)

### attendance_daily_facts
Snapshot por `user_id + date` con métricas precomputadas:
- estado diario,
- tardanza,
- minutos trabajados,
- conteos IN/OUT,
- incidencias de geofence,
- versión de regla aplicada.

### attendance_rule_versions
Versionado semántico de reglas para reproducibilidad:
- una versión activa,
- configuración JSONB de reglas,
- referencia desde `report_runs` y snapshots.

## SLO y KPIs operativos

- **Error rate exportaciones** < 1%
- **Disponibilidad** > 99.5%
- **p95 de duración** según presupuesto mensual

Consulta operativa:

```sql
SELECT *
FROM public.get_report_runs_operational_kpis(now() - interval '30 days');
```

## Capacidad y tuning

- Usar snapshots diarios para reducir carga de cierres mensuales.
- Revisar índices con base en `EXPLAIN ANALYZE` de la RPC mensual.
- Evaluar particionamiento de `attendance_marks` al superar umbrales (volumen/p95/ventana de mantenimiento).

## Seguridad

- RPCs y funciones con controles de scope/rol.
- Bucket de reportes privado (`monthly-reports`) y descarga por signed URL.
- RLS en `report_runs` y `attendance_daily_facts`.
