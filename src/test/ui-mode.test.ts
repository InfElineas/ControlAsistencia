import { describe, expect, it } from 'vitest';
import { resolveUIMode } from '@/hooks/use-ui-mode';

describe('resolveUIMode', () => {
  it('prioriza override por query param', () => {
    expect(resolveUIMode({ role: 'superadmin', isMobile: true, search: '?ui=employee' })).toBe('employee');
  });

  it('usa employee para employee en móvil', () => {
    expect(resolveUIMode({ role: 'employee', isMobile: true, search: '' })).toBe('employee');
  });

  it('mantiene admin para roles administrativos', () => {
    expect(resolveUIMode({ role: 'global_manager', isMobile: true, search: '' })).toBe('admin');
  });
});
