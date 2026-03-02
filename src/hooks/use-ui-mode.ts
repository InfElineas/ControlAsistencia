import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { AppRole } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';

export type UIMode = 'admin' | 'employee';

const ADMIN_ROLES: AppRole[] = ['department_head', 'global_manager', 'superadmin'];

function getOverride(search: string): UIMode | null {
  const value = new URLSearchParams(search).get('ui');
  if (value === 'admin' || value === 'employee') {
    return value;
  }
  return null;
}

export function resolveUIMode({
  role,
  isMobile,
  search,
}: {
  role: AppRole | null;
  isMobile: boolean;
  search: string;
}): UIMode {
  const override = getOverride(search);
  if (override) {
    return override;
  }

  const isAdminRole = role ? ADMIN_ROLES.includes(role) : false;
  if (isMobile && !isAdminRole) {
    return 'employee';
  }

  return 'admin';
}

export function useUIMode(role: AppRole | null): UIMode {
  const isMobile = useIsMobile();
  const { search } = useLocation();

  return useMemo(() => resolveUIMode({ role, isMobile, search }), [isMobile, role, search]);
}
