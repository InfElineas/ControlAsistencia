import { ReactNode, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';
import { isNativeRuntime } from '@/lib/mobile-runtime';
import { requestBackgroundLocationPermission, requestForegroundLocationPermission } from '@/lib/location-service';
import { requestNotificationPermission } from '@/lib/notification-permissions';

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
  excludedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles, excludedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  useEffect(() => {
    if (!user || !isNativeRuntime()) return;

    const permissionPromptKey = `location-permission-prompted:${user.id}`;
    if (window.sessionStorage.getItem(permissionPromptKey) === '1') return;

    const requestStartupPermissions = async () => {
      const foregroundResult = await requestForegroundLocationPermission();
      if (foregroundResult.state === 'granted') {
        await requestBackgroundLocationPermission();
      }

      await requestNotificationPermission();

      if (foregroundResult.prompted) {
        window.sessionStorage.setItem(permissionPromptKey, '1');
      }
    };

    void requestStartupPermissions();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if ((allowedRoles || excludedRoles) && !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Validando permisos...</p>
        </div>
      </div>
    );
  }

  if (excludedRoles && role && excludedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
