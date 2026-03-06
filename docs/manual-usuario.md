# Manual de Usuario (Guía práctica)

> Este manual está pensado para personas con poca experiencia en tecnología.
> Aquí encontrarás pasos claros para usar **Control de Asistencia ELINEAS** con las funciones más recientes.

---

## 1) ¿Qué puedes hacer en este sistema?

### Como colaborador

- Iniciar sesión.
- Marcar **entrada** y **salida**.
- Seleccionar una **ubicación de trabajo** antes de marcar (si tu empresa la usa).
- Revisar historial de marcajes.
- Crear incidencias sobre tus marcajes (ejemplo: olvidé marcar, tardanza, salida temprana).
- Gestionar tu perfil y cambiar tu contraseña.
- Solicitar vacaciones o días de descanso (según permisos).

### Como jefe de departamento / gestor

Además de lo anterior, puedes:

- Crear incidencias para usuarios de tus departamentos.
- Aprobar o rechazar incidencias creadas por los colaboradores.
- Marcar ausencias como **justificadas** o **no justificadas**.
- Gestionar horarios por departamento (si tienes permisos).

### Como superadmin

Además de lo anterior, puedes:

- Administrar usuarios (crear, editar, eliminar).
- Configurar parámetros globales del sistema (zona horaria, modo de salida automática, etc.).
- Usar herramientas de administración y auditoría.

---

## 2) Requisitos mínimos

- Internet estable.
- Usuario y contraseña activos.
- Navegador actualizado (Chrome, Edge, Firefox o Safari).
- Si marcas asistencia por ubicación, debes permitir acceso al GPS/ubicación.

---

## 3) Iniciar sesión

1. Abre el enlace del sistema.
2. Escribe tu **correo** y **contraseña**.
3. Pulsa **Iniciar sesión**.

### Si no recuerdas la contraseña

- Pide ayuda al administrador del sistema.
- Si tu organización lo habilitó, también pueden enviarte correo de restablecimiento.

### Si ves error al entrar (por ejemplo, 400)

1. Revisa correo/contraseña (incluyendo mayúsculas/minúsculas).
2. Borra caché del navegador o prueba una ventana privada.
3. Cierra sesión en otras pestañas y vuelve a intentar.
4. Si persiste, contacta soporte con captura de pantalla y hora del error.

---

## 4) Marcar asistencia (Entrada / Salida)

1. Entra a la opción **Marcar**.
2. Verifica que la ubicación (GPS) esté activa.
3. **Selecciona la ubicación de trabajo** (si aparece el selector).
4. Pulsa el botón de:
   - **Entrada** al iniciar la jornada.
   - **Salida** al terminar.

### Mensajes comunes

- **"Entrada registrada correctamente"**: todo bien.
- **"Entrada registrada con tardanza"**: marcaste después de la hora esperada.
- **"Debes estar dentro de la zona autorizada"**: estás fuera del perímetro permitido.
- **"Precisión de GPS insuficiente"**: intenta moverte a un lugar con mejor señal.

### Nota sobre salida automática

Tu empresa puede definir el cierre de jornada en 3 modos:

- **Manual**: tú haces la salida.
- **Por horario**: salida automática a una hora global.
- **Por salida de geocerca**: salida automática si sales del área por varios minutos.

Si no estás seguro de cuál aplica, consulta a tu administrador.

---

## 5) Ubicaciones de trabajo (Work Locations)

Si tu empresa maneja sedes/zonas:

- Debes elegir la sede correcta antes de marcar.
- Cada sede puede tener su propio radio y precisión GPS requerida.
- Si cambias de sede, actualiza la selección antes de registrar asistencia.

> La selección suele mantenerse entre pestañas/ventanas del navegador.

---

## 6) Ver historial personal

1. Entra a **Mi Historial**.
2. Revisa fechas, horas y estado de cada marcaje.
3. Si detectas un error, crea una incidencia o avisa a tu jefe.

---

## 7) Incidencias (colaborador y jefatura)

### 7.1 Crear incidencia (colaborador)

1. Ve a la sección de **Incidencias**.
2. Selecciona el tipo (ejemplo: olvidé marcar, tardanza, salida temprana).
3. Agrega un motivo claro.
4. Guarda la solicitud.

Estado inicial: **Pendiente**.

### 7.2 Revisión de incidencias (jefe/gestor)

- El jefe/gestor revisa incidencias del personal a su cargo.
- Puede **aprobar** o **rechazar** y dejar observaciones.
- El colaborador recibe el resultado.

### 7.3 Incidencia creada por jefatura

- El jefe/gestor también puede **registrar incidencias directamente** para un trabajador.
- Luego la incidencia sigue su flujo de revisión según configuración interna.

---

## 8) Vacaciones y descansos

1. Entra a **Vacaciones** o **Descansos** (según módulo habilitado).
2. Crea tu solicitud con fechas.
3. Espera revisión.

Estados:

- **Pendiente**
- **Aprobada**
- **Rechazada**

### Regla de separación mínima entre descansos

- El sistema puede exigir una cantidad mínima de días entre descansos.
- Esta regla puede aplicarse solo a **departamentos específicos** (no necesariamente a todos).
- Si tu solicitud se bloquea, consulta con RRHH/jefatura si tu departamento está incluido en esa regla.

### Modo departamento sin descanso (pausado)

- Tu departamento puede estar temporalmente en modo **sin descanso**.
- En ese periodo no podrás registrar nuevos descansos/vacaciones según la política configurada.

---

## 9) Perfil de usuario

Desde **Mi perfil** puedes:

- Ver y actualizar datos personales (nombre, teléfono, etc.).
- Cambiar contraseña desde la opción de seguridad.

Recomendación:

- Usa una contraseña fuerte y no la compartas.

---

## 10) Reportes (jefes y gestores)

En reportes podrás ver:

- Estado diario del personal.
- Entradas/salidas y tardanzas.
- Geocerca / ubicación (si aplica).
- Ausencias justificadas y no justificadas.

También puedes exportar a **Excel (XLSX)** cuando la opción esté habilitada.

---

## 11) Gestión de ausencias (jefes/gestores)

Cuando un colaborador aparece ausente, puedes marcar la ausencia como:

- **Justificada**
- **No justificada**

Esto impacta reportes y seguimiento de cumplimiento.

---

## 12) Gestión de usuarios (superadmin)

Desde el módulo de usuarios, el superadmin puede:

- Crear usuarios.
- Editar rol y departamento.
- Eliminar usuarios (con confirmación).

### Si no se puede eliminar un usuario

A veces la eliminación falla por dependencias internas (auditoría, sesiones, identidades, etc.).

Buenas prácticas:

1. Intenta desde el panel con rol **superadmin**.
2. Si falla, revisa el mensaje exacto.
3. Escala a soporte técnico/Supabase para limpieza segura de dependencias.
4. Como último recurso, usar una limpieza transaccional en base de datos por personal técnico autorizado.

> Evita ejecutar borrados manuales si no tienes experiencia, porque puedes afectar integridad de datos.

---

## 13) Configuración global (superadmin/configuración)

Tu organización puede configurar:

- Zona horaria global del sistema.
- Tolerancia de tardanza.
- Modo de salida automática.
- Separación mínima de descansos y departamentos a los que aplica.

Si notas comportamientos distintos entre departamentos, puede deberse a esta configuración.

---

## 14) Problemas comunes y solución rápida

### A) Pantalla en blanco o no carga

- Recarga la página (F5).
- Cierra sesión y vuelve a entrar.
- Prueba otro navegador.
- Si sigue igual, reporta al administrador.

### B) No deja marcar asistencia

- Revisa internet.
- Activa ubicación GPS.
- Verifica que seleccionaste la ubicación de trabajo correcta.
- Confirma que estás dentro de la zona permitida.

### C) No deja crear descanso/vacación

- Verifica si tu departamento está en modo pausado/sin descanso.
- Revisa separación mínima de días entre descansos.

### D) No se puede eliminar usuario

- Confirma que eres superadmin.
- Verifica que no sea el último superadmin.
- Si persiste, requiere revisión técnica de dependencias.

---

## 15) Buenas prácticas

- No compartas tu contraseña.
- Cierra sesión en equipos compartidos.
- Marca asistencia apenas llegues/salgas.
- Mantén activo GPS al marcar (si aplica).
- Reporta errores con captura y hora exacta.

---

## 16) Glosario rápido

- **Entrada**: primer marcaje del día al iniciar jornada.
- **Salida**: marcaje al terminar jornada.
- **Tardanza**: entrada después del horario definido.
- **Geocerca**: zona permitida para marcar por ubicación.
- **Incidencia**: solicitud/reporte por marcaje irregular.
- **Ausencia justificada**: falta con motivo aceptado.
- **Departamento pausado / sin descanso**: estado temporal que bloquea solicitudes de descanso.

---

## 17) Contacto de soporte

Cuando reportes un problema, incluye:

- Tu nombre y correo.
- Hora aproximada del problema.
- Qué estabas intentando hacer.
- Captura de pantalla (si es posible).
- Mensaje exacto del error.
