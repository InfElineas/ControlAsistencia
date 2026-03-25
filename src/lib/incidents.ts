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

export function getIncidentStatusClasses(status: IncidentStatus): {
  badgeClassName: string;
  cardClassName: string;
  dotClassName: string;
} {
  if (status === 'approved') {
    return {
      badgeClassName: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
      cardClassName: 'border-l-4 border-l-emerald-500 bg-emerald-500/5',
      dotClassName: 'bg-emerald-500',
    };
  }

  if (status === 'rejected') {
    return {
      badgeClassName: 'border-rose-500/30 bg-rose-500/15 text-rose-700 dark:text-rose-300',
      cardClassName: 'border-l-4 border-l-rose-500 bg-rose-500/5',
      dotClassName: 'bg-rose-500',
    };
  }

  return {
    badgeClassName: 'border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    cardClassName: 'border-l-4 border-l-amber-500 bg-amber-500/5',
    dotClassName: 'bg-amber-500',
  };
}

export function getIncidentTypeLabel(type: IncidentType): string {
  if (type === 'olvidé marcar') return 'Olvidé marcar';
  if (type === 'tardanza') return 'Tardanza';
  if (type === 'salida temprana') return 'Salida temprana';
  if (type === 'gps') return 'GPS';
  return 'Geofence';
}
