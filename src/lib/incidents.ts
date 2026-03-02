export const INCIDENT_TYPES = ['olvidé marcar', 'tardanza', 'salida temprana', 'gps', 'geofence'] as const;

export type IncidentType = (typeof INCIDENT_TYPES)[number];
export type IncidentStatus = 'pending' | 'approved' | 'rejected';

export interface DBErrorShape {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function isSchemaNotReadyError(error: unknown): boolean {
  const dbError = error as DBErrorShape | null;
  if (!dbError) return false;
  return dbError.code === '42P01' || dbError.message?.toLowerCase().includes('attendance_incidents') === true;
}

export function buildIncidentErrorMessage(error: unknown): string {
  const dbError = error as DBErrorShape | null;
  if (!dbError) {
    return 'No fue posible completar la operación.';
  }

  if (isSchemaNotReadyError(error)) {
    return 'Falta actualizar la base de datos: ejecuta las migraciones para habilitar incidencias.';
  }

  return dbError.message || 'No fue posible completar la operación.';
}

export function formatIncidentStatus(status: IncidentStatus): string {
  if (status === 'pending') return 'Pendiente';
  if (status === 'approved') return 'Aprobada';
  return 'Rechazada';
}
