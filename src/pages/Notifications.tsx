import { useMemo, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { es } from 'date-fns/locale';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNotifications } from '@/contexts/NotificationsContext';

type ReadFilter = 'all' | 'unread' | 'read';
type TypeFilter = 'all' | 'info' | 'success' | 'warning' | 'error';

function sectionLabel(iso: string): string {
  const date = new Date(iso);
  if (isToday(date)) return 'Hoy';
  if (isYesterday(date)) return 'Ayer';
  return format(date, "EEEE, d 'de' MMMM", { locale: es });
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, loading } = useNotifications();
  const [readFilter, setReadFilter] = useState<ReadFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return notifications.filter((notification) => {
      const readMatches =
        readFilter === 'all' ||
        (readFilter === 'unread' && !notification.is_read) ||
        (readFilter === 'read' && notification.is_read);

      const typeMatches = typeFilter === 'all' || notification.type === typeFilter;

      const searchMatches =
        !normalizedSearch ||
        notification.title.toLowerCase().includes(normalizedSearch) ||
        notification.message.toLowerCase().includes(normalizedSearch);

      return readMatches && typeMatches && searchMatches;
    });
  }, [notifications, readFilter, typeFilter, search]);

  const grouped = useMemo(() => {
    return filtered.reduce<Record<string, typeof filtered>>((acc, notification) => {
      const key = sectionLabel(notification.created_at);
      if (!acc[key]) acc[key] = [];
      acc[key].push(notification);
      return acc;
    }, {});
  }, [filtered]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Centro de notificaciones
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Sin leer: {unreadCount}</Badge>
                <Button size="sm" variant="outline" onClick={() => markAllAsRead()} disabled={unreadCount === 0}>
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Marcar todas
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Input
                placeholder="Buscar por título o mensaje"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />

              <Select value={readFilter} onValueChange={(value) => setReadFilter(value as ReadFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="unread">Sin leer</SelectItem>
                  <SelectItem value="read">Leídas</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(value) => setTypeFilter(value as TypeFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="success">Éxito</SelectItem>
                  <SelectItem value="warning">Advertencia</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Filter className="h-3 w-3" />
              Mostrando {filtered.length} de {notifications.length} notificaciones
            </div>
          </CardContent>
        </Card>

        {loading && <p className="text-sm text-muted-foreground">Cargando notificaciones...</p>}

        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No hay notificaciones para los filtros seleccionados.
            </CardContent>
          </Card>
        )}

        {Object.entries(grouped).map(([group, items]) => (
          <div key={group} className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{group}</h3>
            {items.map((notification) => (
              <Card key={notification.id} className={!notification.is_read ? 'border-primary/40' : ''}>
                <CardContent className="space-y-2 pt-6">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{notification.title}</p>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {notification.type}
                      </Badge>
                      {!notification.is_read && <Badge>Nuevo</Badge>}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">{notification.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(notification.created_at), 'dd/MM/yyyy HH:mm', { locale: es })}
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
        ))}
      </div>
    </AppLayout>
  );
}
