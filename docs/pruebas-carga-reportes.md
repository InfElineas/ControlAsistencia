# Pruebas de carga para cierre mensual (6 meses)

## Objetivo
Validar desempeño del pipeline para 1000+ empleados y 6 meses de datos.

## Estrategia

1. Poblar dataset sintético (si no hay datos reales).
2. Ejecutar snapshots diarios por rango.
3. Generar reportes mensuales concurrentes por scope global y departamental.
4. Medir p95, error rate y throughput de filas.

## 1) Dataset sintético (ejemplo base)

> Ajustar a entorno de staging. No ejecutar en producción sin control.

```sql
-- Ejemplo orientativo (adaptar a modelo real de usuarios)
-- Inserta marcajes IN/OUT para últimos 180 días
WITH days AS (
  SELECT generate_series((CURRENT_DATE - INTERVAL '180 day')::date, (CURRENT_DATE - INTERVAL '1 day')::date, '1 day'::interval)::date AS d
)
SELECT d FROM days LIMIT 1;
```

## 2) Snapshot diario por rango

```sql
SELECT public.refresh_attendance_daily_facts_for_range(
  (CURRENT_DATE - INTERVAL '180 day')::date,
  (CURRENT_DATE - INTERVAL '1 day')::date,
  NULL,
  'load_test'
);
```

## 3) Ejecución de reportes (manual/API)

- Lanzar 10–20 ejecuciones en paralelo (global y department).
- Registrar `report_runs.duration_ms`, `status`, `row_count`, `retry_count`.

## 4) Métricas de aceptación

```sql
SELECT *
FROM public.get_report_runs_operational_kpis(now() - interval '7 days');
```

Criterios sugeridos:
- Error rate < 1%
- p95 dentro del SLO acordado
- disponibilidad > 99.5%

## 5) Resultado

Documentar:
- p50/p95 por tipo de reporte,
- volumen de filas procesadas,
- top errores y acciones de mitigación.
