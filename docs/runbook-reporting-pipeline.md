# Runbook operativo del pipeline de reportes mensuales

## Objetivo
Operar el pipeline de reportes de forma segura y repetible: generación manual, reintento de fallos, restauración de artefactos y verificación de SLO.

## 1) Generación manual de un reporte

1. Desde UI (Panel Global/Department), ejecutar **Generar reporte**.
2. Verificar en `report_runs` que cambie a `running` y luego `completed`.
3. Validar artefacto en bucket `monthly-reports`.

Consulta de apoyo:

```sql
SELECT id, status, scope, period_start, period_end, row_count, retry_count, duration_ms, artifact_path, error, created_at
FROM public.report_runs
ORDER BY created_at DESC
LIMIT 20;
```

## 2) Reintento de jobs fallidos

### Opción A — Reintento por UI
- Volver a ejecutar con el mismo filtro/periodo.
- Se creará un nuevo `report_runs` (no se muta el histórico fallido).

### Opción B — Reintento programático
1. Tomar filtros del run fallido.
2. Invocar `generate-monthly-report` con el mismo payload.

## 3) Restauración de artefactos

Si un usuario no puede descargar un archivo:

1. Confirmar que `report_runs.status='completed'` y `artifact_path` existe.
2. Generar signed URL nueva (expira en 60s):

```ts
const { data } = await supabase.storage
  .from('monthly-reports')
  .createSignedUrl('<artifact_path>', 60)
```

3. Si no existe el archivo, re-generar reporte (nuevo run).

## 4) Verificación rápida de SLO

```sql
SELECT *
FROM public.get_report_runs_operational_kpis(now() - interval '30 days');
```

Objetivos actuales:
- Error rate < 1%
- Disponibilidad > 99.5%
- p95 mensual dentro del presupuesto operativo definido

## 5) Incidentes comunes

### A) Aumento de error rate
- Revisar `report_runs.error` de los últimos fallos.
- Correlacionar con `audit_log` (`MONTHLY_REPORT_FAILED`).
- Verificar estado de Storage y permisos de bucket.

### B) p95 de duración alto
- Revisar volumen de `attendance_marks` y cardinalidad por periodo.
- Ejecutar `EXPLAIN ANALYZE` de `get_attendance_report_monthly`.
- Validar cobertura de `attendance_daily_facts` y ejecutar snapshot/recalculo si falta.

### C) Reportes sin filas
- Validar filtros (scope, department_id, fechas).
- Confirmar presencia de perfiles y marcajes en el rango.

## 6) Checklist de cierre mensual

1. Ejecutar snapshot diario pendiente (`snapshot-daily-facts`).
2. Revisar KPIs operativos 30d.
3. Generar reporte mensual final.
4. Confirmar `checksum`, `row_count`, `artifact_path` en `report_runs`.
5. Registrar incidente si hay reintentos > 0 o fallos.
