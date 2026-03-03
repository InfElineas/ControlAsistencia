import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';

export function AppRouterBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();

  return <AppErrorBoundary resetKey={location.pathname}>{children}</AppErrorBoundary>;
}
