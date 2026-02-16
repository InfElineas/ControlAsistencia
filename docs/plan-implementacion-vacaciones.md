# Plan de implementación: Sistema de Vacaciones

## 1) Contexto actual del proyecto

El sistema ya cuenta con piezas clave que facilitan incorporar vacaciones sin rediseñar todo:

- Control de asistencia por marcajes `IN`/`OUT` y validación centralizada vía función `validate_attendance_mark`.
- Catálogo de usuarios/roles/departamentos (`profiles`, `user_roles`, `departments`).
- Lógica de días no laborables por departamento (`work_calendar`) y descansos recurrentes por usuario (`user_rest_schedule`).
- Dashboards de jefatura/global que hoy clasifican principalmente en presente/ausente y exportan reportes XLSX.

Esto permite sumar vacaciones como **una nueva capa de “estado laboral del día”** que conviva con descanso, feriado/no laborable y asistencia.

---

## 2) Objetivos del módulo de vacaciones

1. Permitir a empleados solicitar vacaciones por rango de fechas.
2. Permitir aprobación/rechazo por jefatura (y/o global manager según política).
3. Bloquear o evitar marcajes de asistencia cuando el día esté aprobado como vacaciones.
4. Reflejar vacaciones en paneles, métricas y exportaciones (sin contarlas como ausencias).
5. Mantener trazabilidad (auditoría) y reglas claras de negocio.

---

## 3) Modelo de datos propuesto (Supabase)

### 3.1 Tabla principal: `vacation_requests`

Campos sugeridos:

- `id uuid pk`
- `user_id uuid not null` (empleado solicitante)
- `department_id uuid not null` (redundante para facilitar filtros/reportes)
- `start_date date not null`
- `end_date date not null`
- `business_days integer not null` (calculado al crear)
- `status text not null check in ('pending','approved','rejected','cancelled')`
- `reason text null`
- `reviewed_by uuid null`
- `reviewed_at timestamptz null`
- `review_comment text null`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

Índices:

- `(user_id, start_date, end_date)`
- `(department_id, status, start_date)`
- índice parcial para pendientes: `where status = 'pending'`

### 3.2 Tabla de saldo anual (opcional pero recomendable): `vacation_balances`

- `id uuid pk`
- `user_id uuid not null`
- `year integer not null`
- `granted_days integer not null`
- `used_days integer not null default 0`
- `pending_days integer not null default 0`
- `updated_at timestamptz`
- `unique(user_id, year)`

> Si quieren empezar simple, se puede diferir esta tabla y calcular “consumido” desde `vacation_requests` aprobadas.

### 3.3 Restricciones clave

- `start_date <= end_date`.
- No permitir solapes de solicitudes activas del mismo usuario (`pending`/`approved`) sobre el mismo rango.
- No permitir aprobar si excede saldo (si balance está activo).

---

## 4) Seguridad y RLS

Aplicar políticas alineadas al esquema actual de roles:

- Empleado:
  - `SELECT` de sus solicitudes.
  - `INSERT` de sus solicitudes.
  - `UPDATE` solo para cancelar solicitud propia en estado `pending`.
- Department head:
  - `SELECT` solicitudes de su departamento.
  - `UPDATE` de estado (`approved/rejected`) solo dentro de su departamento.
- Global manager:
  - `SELECT/UPDATE` global.

Además:

- Trigger `updated_at`.
- Inserción en `audit_log` en transiciones de estado relevantes.

---

## 5) Reglas de negocio (MVP)

1. **Solicitud**
   - Rango obligatorio.
   - Motivo opcional (o requerido por política).
   - No permitir fechas pasadas (configurable).
2. **Aprobación**
   - Solo `pending` -> `approved/rejected`.
   - Requiere `reviewed_by` + `reviewed_at`.
3. **Cancelación**
   - Permitida por empleado solo si `pending`.
   - Si está `approved`, definir si solo jefatura puede revertir.
4. **Jerarquía diaria de estados** (sugerida para reportes):
   - `VACACIONES` > `DESCANSO` > `NO_LABORABLE` > `PRESENTE/AUSENTE`.
   - Así no se etiqueta ausente a alguien en vacaciones.

---

## 6) Integración con asistencia

### 6.1 Backend (función de validación)

Ampliar la lógica de validación de marcajes para consultar si la fecha actual cae dentro de vacaciones aprobadas:

- Si hay vacaciones aprobadas para el usuario en la fecha actual:
  - Denegar `IN` y `OUT` con código claro (`ON_VACATION`).
  - Mensaje: “No puedes marcar asistencia durante vacaciones aprobadas”.

### 6.2 Frontend (hooks y UX)

- Extender `useAttendance` para mapear el nuevo código de error.
- Mostrar en home/attendance un estado visual “Hoy estás de vacaciones”.
- En dashboards, computar `VACACIONES` como categoría propia.

---

## 7) Pantallas y flujos UI

## 7.1 Empleado

Nueva ruta: `/vacations`

- Formulario de solicitud:
  - Fecha inicio/fin
  - Días estimados
  - Motivo
- Listado propio con estados y filtro por año/estado.
- Acción “Cancelar” para pendientes.

## 7.2 Jefatura y global

- Bandeja de aprobaciones:
  - Filtros por departamento, estado, rango.
  - Acciones rápidas aprobar/rechazar con comentario.
- Vista histórica para auditoría operativa.

## 7.3 Integración navegación

- Añadir acceso rápido en `Index` y entradas en menú lateral según rol.

---

## 8) Reportería y exportación

Actualizar exportaciones XLSX (departamento/global) para que por cada día del rango:

- `status` contemple `VACACIONES`.
- `in_time`/`out_time` queden nulos en vacaciones.
- Métricas agregadas distingan:
  - presentes
  - ausentes
  - vacaciones
  - descansos/no laborables

---

## 9) Plan por fases (iterativo)

### Fase 1 — Base de datos y seguridad (1 sprint)

- Migraciones: tablas, índices, constraints, RLS, triggers.
- Tipado regenerado de Supabase (`types.ts`).
- Casos de prueba SQL básicos (solapes, permisos, cambios de estado).

### Fase 2 — APIs y validación asistencia (1 sprint)

- RPC/helper para crear solicitud y validar saldo/solapes.
- RPC de aprobación/rechazo.
- Integración en `validate-attendance` con bloqueo por vacaciones.

### Fase 3 — Frontend empleado (1 sprint)

- Página `/vacations` + hook `useVacations`.
- Estados visuales en Home/Attendance.
- Notificaciones de éxito/error consistentes.

### Fase 4 — Frontend gestión y reportes (1 sprint)

- Bandeja de aprobaciones para jefatura/global.
- Ajustes en paneles y exportaciones XLSX.
- Métricas y filtros nuevos.

### Fase 5 — Endurecimiento y rollout (0.5 sprint)

- QA funcional + pruebas de regresión de asistencia.
- Backfill opcional de saldos.
- Feature flag de activación progresiva por rol/departamento.

---

## 10) Riesgos y mitigaciones

1. **Solapes y reglas ambiguas**
   - Mitigar con constraints + funciones transaccionales (no solo validación en cliente).
2. **Impacto en métricas existentes**
   - Versionar fórmula de KPIs y validar con negocio antes de desplegar.
3. **Rendimiento en reportes**
   - Añadir índices por rango/estado y evitar N+1 en consultas.
4. **Conflicto con días no laborables/descanso**
   - Definir precedencia explícita (sección 5) y testear combinaciones.

---

## 11) Checklist técnico de implementación

- [ ] Migración SQL `vacation_requests` (+ `vacation_balances` opcional)
- [ ] RLS + políticas por rol
- [ ] RPCs de crear/aprobar/rechazar/cancelar
- [ ] Integración en edge function de asistencia
- [ ] Hook `useVacations`
- [ ] Página empleado vacaciones
- [ ] Bandeja de aprobación jefatura/global
- [ ] Actualización de métricas y XLSX
- [ ] Tests unitarios + integración (frontend/backend)
- [ ] Documentación operativa para RRHH y jefaturas

---

## 12) Recomendación de prioridad

Para obtener valor rápido sin fricción:

1. Implementar primero **solicitud + aprobación + bloqueo de marcaje en vacaciones aprobadas**.
2. En segunda ola, agregar **saldos anuales** y reglas avanzadas (anticipación mínima, blackout dates, etc.).
3. En tercera ola, incorporar **notificaciones** (email/in-app) y calendario de equipo.

