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
supabase functions deploy generate-monthly-report --no-verify-jwt=false
```

## 4) Validación rápida post-migración

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
