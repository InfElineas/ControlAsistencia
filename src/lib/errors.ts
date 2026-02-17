export function getErrorMessage(error: unknown, fallback = 'Ha ocurrido un error inesperado'): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const knownKeys = ['message', 'error_description', 'error', 'details', 'hint'] as const;

    for (const key of knownKeys) {
      const value = (error as Record<string, unknown>)[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    const code = (error as Record<string, unknown>).code;
    const status = (error as Record<string, unknown>).status;

    if (typeof code === 'string' && code.trim().length > 0) {
      return `Error ${code}`;
    }

    if (typeof status === 'number') {
      return `Error HTTP ${status}`;
    }
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return fallback;
}
