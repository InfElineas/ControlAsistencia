import { describe, expect, it } from 'vitest';
import { buildIncidentErrorMessage, formatIncidentStatus, isSchemaNotReadyError } from '@/lib/incidents';

describe('incidents utils', () => {
  it('detecta schema no lista por código', () => {
    expect(isSchemaNotReadyError({ code: '42P01' })).toBe(true);
  });

  it('mapea estado a etiqueta legible', () => {
    expect(formatIncidentStatus('pending')).toBe('Pendiente');
    expect(formatIncidentStatus('approved')).toBe('Aprobada');
    expect(formatIncidentStatus('rejected')).toBe('Rechazada');
  });

  it('genera mensaje amigable en error de schema', () => {
    expect(buildIncidentErrorMessage({ code: '42P01' })).toContain('migraciones');
  });
});
