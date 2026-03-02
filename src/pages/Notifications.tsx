import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications } from '@/contexts/NotificationsContext';
import { Link } from 'react-router-dom';

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return notifications;
    if (filter === 'unread') return notifications.filter((n) => !n.is_read);
    return notifications.filter((n) => n.is_read);
  }, [filter, notifications]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Notificaciones</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Sin leer: {unreadCount}</Badge>
                <Button size="sm" variant="outline" onClick={() => markAllAsRead()} disabled={unreadCount === 0}>
                  Marcar todas
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Select value={filter} onValueChange={(value) => setFilter(value as 'all' | 'unread' | 'read')}>
              <SelectTrigger className="max-w-xs">
                <SelectValue placeholder="Filtrar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="unread">Sin leer</SelectItem>
                <SelectItem value="read">Leídas</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {loading && <p className="text-sm text-muted-foreground">Cargando notificaciones...</p>}

        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">No hay notificaciones para este filtro.</CardContent>
          </Card>
        )}

        {filtered.map((notification) => (
          <Card key={notification.id} className={!notification.is_read ? 'border-primary/40' : ''}>
            <CardContent className="space-y-2 pt-6">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{notification.title}</p>
                {!notification.is_read && <Badge>Nuevo</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">{notification.message}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(notification.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
              </p>
              <div className="flex items-center gap-2">
                {!notification.is_read && (
                  <Button size="sm" variant="outline" onClick={() => markAsRead(notification.id)}>
                    Marcar leída
                  </Button>
                )}
                {notification.link && (
                  <Button size="sm" asChild>
                    <Link to={notification.link}>Ir</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
}
