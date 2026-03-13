# Análisis profundo del repo: escalabilidad y trazabilidad de estadísticas para reportes mensuales

## 1) Resumen ejecutivo

El repositorio ya tiene una base sólida para control de asistencia (Supabase + React + Edge Functions), pero en la capa de **reportería mensual** aún existe un cuello de botella importante: gran parte del cálculo se hace desde el frontend y con múltiples consultas por usuario, lo que limita escalabilidad y complica auditoría reproducible.

Hallazgos clave:

1. **N+1 queries en exportaciones** (GlobalPanel y Department): se consulta `attendance_marks` por cada empleado en loops del cliente.
2. **Cálculo de KPIs en cliente**: estados y tardanzas se recomputan en React, dificultando trazabilidad histórica y consistencia entre vistas.
3. **Buena base de gobernanza**: ya existe `audit_log` expandido con `metadata` e índices, ideal para evolucionar a trazabilidad de pipeline de reportes.
4. **Índices parciales**: hay índices útiles para incidencias y auditoría, pero no una estrategia completa para agregados mensuales en asistencia.
5. **Exportación síncrona en navegador**: funciona para volúmenes bajos/medios, pero no escala para cierres mensuales multi-departamento.

## 2) Diagnóstico técnico del estado actual

### 2.1 Arquitectura y flujo

- Frontend React/Vite usa Supabase JS para consultas directas.
- Dominio de asistencia persiste en `attendance_marks` y se enriquece con vacaciones, justificación de ausencias y configuración por departamento.
- Exportación mensual (XLSX) se arma en cliente y se descarga localmente.

### 2.2 Puntos fuertes existentes

- Cálculo utilitario reutilizable de tardanza (`calculateLateMinutes`) ya centralizado en `src/lib/attendance-metrics.ts`.
- Integración de geocerca y precisión GPS en la Edge Function de validación de marcaje.
- Presencia de `audit_log` con `metadata` JSONB e índices para observabilidad técnica.

### 2.3 Riesgos de escalabilidad detectados

#### a) N+1 en reportes mensuales

En `GlobalPanel` y `Department`, la exportación recorre empleados y hace una consulta por cada uno:

- patrón: `for (const emp of employees) { await supabase.from('attendance_marks')... }`
- impacto: latencia acumulada, más round-trips de red, mayor probabilidad de timeouts y UX degradada al crecer la nómina.

#### b) Métricas "on the fly" en cliente

Estados `PRESENTE/TARDE/AUSENTE`, tardanzas y consolidaciones se recalculan en el browser. Esto genera:

- divergencias potenciales entre vistas (global, departamento, histórico);
- dificultad para reproducir "el mismo reporte" semanas después si cambian reglas;
- menor auditabilidad del proceso de generación.

#### c) Exportación sin job asíncrono

La descarga XLSX ocurre en sesión interactiva del usuario. Para cierres mensuales:

- la operación no tiene cola ni reintento;
- no deja rastro formal de ejecución (inicio/fin/error/usuario/parámetros);
- no permite reutilizar un reporte ya generado.

### 2.4 Riesgos de trazabilidad detectados

1. Falta una entidad explícita de **ejecución de reporte** (quién, cuándo, filtros, versión de reglas, resultado).
2. Falta versionado formal de reglas de cálculo aplicadas por período (p. ej. timezone global, tolerancia de tardanza, inclusión de jefes).
3. La salida XLSX no queda persistida con huella (checksum, filas, periodo), reduciendo capacidad de auditoría.

## 3) Estrategia de mejora guiada (por fases)

## Fase 1 — Estabilización de consultas y consistencia (2–3 semanas)

Objetivo: reducir latencia y variabilidad sin rediseño mayor.

1. **Mover consolidación mensual a SQL/RPC**
   - Crear RPC `get_attendance_report_monthly(_from date, _to date, _department_id uuid, _scope text)`.
   - Retornar filas ya agregadas por usuario/día con estado, entrada, salida, tardanza y banderas de geocerca.
   - Beneficio: elimina N+1 y centraliza lógica de negocio.

2. **Unificar reglas en DB**
   - Implementar función SQL de estado diario (`compute_daily_attendance_status`) reutilizada por paneles.
   - Consumirla tanto en panel global como departamento.

3. **Índices orientados a reportes**
   - Verificar/crear índices compuestos recomendados:
     - `(timestamp, user_id)` para barridos por rango mensual;
     - `(user_id, timestamp, mark_type)` para reconstrucción IN/OUT;
     - índice parcial `WHERE mark_type='IN'` si la mayoría de KPIs nacen de entrada.

## Fase 2 — Trazabilidad end-to-end de reportes (3–4 semanas)

Objetivo: que cada reporte mensual sea auditable y reproducible.

1. **Nueva tabla `report_runs`**
   - Campos sugeridos: `id`, `requested_by`, `scope`, `filters jsonb`, `period_start`, `period_end`, `rules_version`, `status`, `row_count`, `checksum`, `artifact_path`, `started_at`, `finished_at`, `error`.

2. **Pipeline asíncrono**
   - Crear Edge Function `generate-monthly-report`:
     - inserta `report_runs` (status `queued/running`),
     - ejecuta SQL de consolidación,
     - genera XLSX/CSV,
     - guarda artefacto en Storage,
     - actualiza `report_runs` + evento en `audit_log`.

3. **Bitácora de negocio y técnica**
   - Registrar en `audit_log.metadata`:
     - filtros aplicados,
     - cantidad de empleados considerados,
     - parámetros de regla (timezone, tolerancias),
     - duración total y errores.

## Fase 3 — Escala analítica y gobierno de datos (4–8 semanas)

Objetivo: soportar crecimiento sostenido y cierres rápidos.

1. **Tabla de hechos diaria (snapshot)**
   - `attendance_daily_facts` por `user_id + date` con métricas precomputadas.
   - Población incremental nocturna (cron) + recalculo selectivo por correcciones.

2. **Particionamiento temporal (si volumen alto)**
   - Particionar `attendance_marks` por mes/trim para mantener tiempos de lectura estables.

3. **Versionado de reglas**
   - Tabla `attendance_rule_versions`.
   - Cada `report_runs` referencia la versión exacta usada.

4. **SLO de reportes**
   - Definir objetivos: p95 generación mensual < X min, error rate < Y%.
   - Dashboard operativo para jobs de reportes.

## 4) Diseño propuesto de modelo de trazabilidad

## 4.1 Entidades mínimas

- `report_runs` (ejecuciones)
- `report_run_items` (opcional, por departamento/unidad)
- `report_artifacts` (si separas metadatos de archivo)
- `attendance_rule_versions`

## 4.2 Principios

1. **Inmutabilidad de resultados**: un reporte generado no se reescribe; se crea nueva ejecución.
2. **Reproducibilidad**: siempre almacenar filtros + versión de reglas + checksum.
3. **Observabilidad**: cada ejecución debe correlacionar con `audit_log`.

## 5) Backlog priorizado (impacto/esfuerzo)

1. **Alta/Media**: RPC consolidada mensual + reemplazo de loops N+1 en frontend.
2. **Alta/Media**: `report_runs` y generación asíncrona en Edge Function.
3. **Alta/Baja**: estandarizar estado diario en función SQL única.
4. **Media/Baja**: agregar telemetría de duración/filas por exportación actual.
5. **Media/Media**: snapshot diario `attendance_daily_facts`.
6. **Media/Alta**: particionado de `attendance_marks` cuando el volumen lo justifique.

## 6) KPIs recomendados para seguimiento de mejora

### Escalabilidad

- Tiempo p50/p95 de generación de reporte mensual.
- Número de consultas DB por reporte.
- Filas procesadas por minuto.
- Tasa de error de exportaciones.

### Trazabilidad

- % reportes con `rules_version` informado.
- % reportes con checksum y artefacto persistido.
- Tiempo medio de investigación de discrepancias.
- Cobertura de eventos en `audit_log` por ejecución.

## 7) Plan de ejecución sugerido (90 días)

- **Días 1–15**: SQL consolidada + reducción N+1 + pruebas de regresión de estados.
- **Días 16–45**: `report_runs`, Edge Function asíncrona, persistencia de artefactos.
- **Días 46–75**: snapshots diarios + observabilidad operativa.
- **Días 76–90**: hardening (índices finales, tuning, runbooks, SLA/SLO).

## 8) Resultado esperado

Aplicando estas mejoras, el sistema pasa de una reportería "client-heavy" a un modelo **data-centric**, con:

- mejor tiempo de respuesta para cierres mensuales,
- menor costo operacional por consulta,
- trazabilidad completa y auditable de cada reporte,
- base lista para crecimiento multi-departamento/multi-sede.
