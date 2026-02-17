import { getErrorMessage } from '@/lib/errors';

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function mapAuthError(error: unknown, action: 'signin' | 'signup'): string {
  const raw = getErrorMessage(error).toLowerCase();

  if (action === 'signin') {
    if (includesAny(raw, ['invalid login', 'invalid credentials', 'email not confirmed'])) {
      return 'Email o contraseña incorrectos.';
    }
    if (includesAny(raw, ['too many requests', 'rate limit'])) {
      return 'Demasiados intentos. Intenta nuevamente en unos minutos.';
    }
    return 'No fue posible iniciar sesión. Verifica tus datos e inténtalo otra vez.';
  }

  if (includesAny(raw, ['already registered', 'user already registered', 'already exists'])) {
    return 'Este correo ya está registrado.';
  }
  if (includesAny(raw, ['password'])) {
    return 'La contraseña no cumple los requisitos mínimos.';
  }
  if (includesAny(raw, ['rate limit', 'too many requests'])) {
    return 'Se alcanzó el límite de intentos. Intenta más tarde.';
  }

  return 'No fue posible crear la cuenta. Intenta nuevamente.';
}

export function mapUserManagementError(error: unknown, action: 'fetch' | 'update' | 'create'): string {
  const raw = getErrorMessage(error).toLowerCase();

  if (includesAny(raw, ['permission denied', 'not authorized', 'forbidden', 'unauthorized'])) {
    return 'No tienes permisos suficientes para realizar esta acción.';
  }

  if (action === 'create') {
    if (includesAny(raw, ['already registered', 'already exists'])) {
      return 'El correo ingresado ya está en uso por otro usuario.';
    }
    return 'No fue posible crear el usuario. Verifica los datos e inténtalo nuevamente.';
  }

  if (action === 'update') {
    return 'No fue posible actualizar el usuario. Intenta nuevamente.';
  }

  return 'No fue posible cargar los usuarios. Intenta nuevamente.';
}

export function mapFormValidationError(message: string): string {
  return message;
}


export function mapAttendanceError(error: unknown): string {
  const message = getErrorMessage(error);
  const raw = message.toLowerCase();

  if (includesAny(raw, ['hora de entrada excedida', 'entrada anticipada no permitida', 'salida se habilita al salir de la zona'])) {
    return message;
  }
  if (includesAny(raw, ['on_vacation', 'vacaciones aprobadas', 'vacation'])) {
    return 'No puedes registrar asistencia durante vacaciones aprobadas.';
  }
  if (includesAny(raw, ['departamento sin horario'])) {
    return 'Tu departamento no tiene un horario configurado para registrar entrada.';
  }
  if (includesAny(raw, ['outside geofence', 'fuera de la zona', 'geofence'])) {
    return 'Debes estar dentro de la zona autorizada para registrar asistencia.';
  }
  if (includesAny(raw, ['unauthorized', 'not authorized'])) {
    return 'No tienes permisos para registrar asistencia.';
  }
  if (includesAny(raw, ['connection', 'network', 'fetch'])) {
    return 'No se pudo conectar con el servidor. Intenta de nuevo.';
  }

  return message || 'No fue posible registrar la asistencia. Intenta nuevamente.';
}

export function mapGenericActionError(error: unknown, fallback: string): string {
  const raw = getErrorMessage(error).toLowerCase();
  if (includesAny(raw, ['permission denied', 'unauthorized', 'forbidden'])) {
    return 'No tienes permisos para realizar esta acción.';
  }
  if (includesAny(raw, ['network', 'connection', 'fetch'])) {
    return 'No se pudo conectar con el servidor. Intenta de nuevo.';
  }
  return fallback;
}
