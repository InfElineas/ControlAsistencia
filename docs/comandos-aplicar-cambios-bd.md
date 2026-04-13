# Listado de comandos para aplicar cambios en BD (Supabase)

Este documento resume comandos prácticos para aplicar en base de datos los cambios de reportería mensual (RPC + índices) y validarlos.

## 1) Prerrequisitos

```bash
# Instalar dependencias del proyecto
npm install

# Verificar que Supabase CLI esté disponible
supabase --version
```

## 2) Flujo local (desarrollo)

```bash
# Levantar stack local de Supabase (DB, auth, etc.)
supabase start

# Aplicar TODAS las migraciones al entorno local
supabase db reset
```

> `supabase db reset` recrea la BD local y aplica todo desde `supabase/migrations`.

## 3) Aplicar cambios al proyecto remoto

```bash
# Autenticar CLI
supabase login

# Vincular repo al proyecto remoto
supabase link --project-ref <TU_PROJECT_REF>

# Empujar migraciones pendientes al remoto
supabase db push

# Desplegar la Edge Function asíncrona de reportes
# (toma verify_jwt desde supabase/config.toml del repo)
supabase functions deploy generate-monthly-report

# Desplegar la Edge Function de snapshots diarios (Fase 3)
supabase functions deploy snapshot-daily-facts
```

## 4) Validación rápida post-migración

### 4.0 Verificar que el fix de CORS quedó desplegado

> Si cambiaste `supabase/config.toml` o los headers CORS de una función, **debes redeployar esa función** para que el cambio aplique en remoto.

```bash
supabase functions deploy generate-monthly-report
```

Smoke test de preflight (debe devolver 2xx y headers CORS):

```bash
curl -i -X OPTIONS "https://<PROJECT_REF>.supabase.co/functions/v1/generate-monthly-report" \
  -H "Origin: https://<tu-dominio-frontend>" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization,apikey,content-type,x-client-info"
```

### 4.1 Verificar que existe la RPC principal

```bash
supabase db remote psql -c "\\df+ public.get_attendance_report_monthly"
```

### 4.2 Verificar función de estado diario

```bash
supabase db remote psql -c "\\df+ public.compute_daily_attendance_status"
```

### 4.3 Verificar índices de asistencia creados

```bash
supabase db remote psql -c "
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'attendance_marks'
  AND indexname IN (
    'idx_attendance_marks_timestamp_user',
    'idx_attendance_marks_user_timestamp_mark_type',
    'idx_attendance_marks_in_partial'
  )
ORDER BY indexname;
"
```

### 4.4 Verificar tabla de trazabilidad de ejecuciones

```bash
supabase db remote psql -c "\d+ public.report_runs"
```

### 4.5 Verificar tablas de escala analítica

```bash
supabase db remote psql -c "\d+ public.attendance_daily_facts"
supabase db remote psql -c "\d+ public.attendance_rule_versions"
```

### 4.6 Smoke test de snapshots diarios

```bash
supabase db remote psql -c "
SELECT public.refresh_attendance_daily_facts((CURRENT_DATE - INTERVAL '1 day')::date, NULL, 'manual_smoke');
"
```

### 4.7 Recalculo selectivo por correcciones

```bash
supabase db remote psql -c "
SELECT public.refresh_attendance_daily_facts_for_range(
  CURRENT_DATE - INTERVAL '7 day',
  CURRENT_DATE - INTERVAL '1 day',
  NULL,
  'attendance_correction'
);
"
```

### 4.8 Programar cron nocturno (Dashboard)

Programar una tarea diaria (ej. 02:10 AM local) que invoque la función `snapshot-daily-facts`.

- Ruta: **Supabase Dashboard → Edge Functions → Schedule**.
- Cron sugerido (UTC): `10 7 * * *` (equivale aprox. 02:10 AM UTC-5).

### 4.9 KPIs operativos (30 días)

```bash
supabase db remote psql -c "
SELECT *
FROM public.get_report_runs_operational_kpis(now() - interval '30 days');
"
```

## 5) Smoke test de la RPC

> Ejecutar con un usuario que tenga permisos (`global_manager` o `superadmin` para scope global).

```bash
supabase db remote psql -c "
SELECT *
FROM public.get_attendance_report_monthly(
  CURRENT_DATE - INTERVAL '7 day',
  CURRENT_DATE,
  NULL,
  'global',
  false
)
LIMIT 20;
"
```

## 6) Flujo recomendado en CI/CD

```bash
# Validar que el SQL compila en entorno efímero/local
supabase db reset

# Desplegar cambios de esquema al entorno objetivo
supabase db push
```

## 7) Rollback (operativo)

Supabase no hace rollback automático de migraciones ya aplicadas. Para revertir:

1. Crear una nueva migración correctiva (`supabase migration new <nombre>`).
2. Escribir SQL de reversión (drop/alter según corresponda).
3. Aplicar con `supabase db push`.
