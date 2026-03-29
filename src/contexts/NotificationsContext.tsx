import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  link: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
}

interface NotificationsContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  refetch: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  createNotification: (input: {
    userId?: string;
    title: string;
    message: string;
    type?: AppNotification['type'];
    link?: string;
  }) => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user, role } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const syncRestScheduleReminder = useCallback(async (userId: string) => {
    if (role !== 'employee' && role !== 'department_head') {
      return;
    }

    const now = new Date();
    const day = now.getDay();
    const mondayDistance = day === 0 ? 6 : day - 1;
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() - mondayDistance);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);

    const weekStart = weekStartDate.toISOString().slice(0, 10);
    const weekEnd = weekEndDate.toISOString().slice(0, 10);

    const reminderTitle = 'Configura tus días de descanso';
    const reminderLink = '/rest-schedule';

    const { data: schedules } = await supabase
      .from('user_rest_schedule')
      .select('id')
      .eq('user_id', userId)
      .gte('effective_from', weekStart)
      .lte('effective_from', weekEnd)
      .limit(1);

    const hasSchedule = Boolean(schedules && schedules.length > 0);

    const { data: existingReminder } = await supabase
      .from('notifications')
      .select('id, is_read')
      .eq('user_id', userId)
      .eq('title', reminderTitle)
      .eq('link', reminderLink)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!hasSchedule) {
      if (!existingReminder) {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: reminderTitle,
          message: 'Debes configurar tus días de descanso de esta semana para evitar bloqueos o incidencias de marcaje.',
          type: 'warning',
          link: reminderLink,
          is_read: false,
        });
        return;
      }

      if (existingReminder.is_read) {
        await supabase
          .from('notifications')
          .update({ is_read: false, read_at: null })
          .eq('id', existingReminder.id);
      }
      return;
    }

    if (existingReminder && !existingReminder.is_read) {
      await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', existingReminder.id);
    }
  }, [role]);

  const refetch = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    await syncRestScheduleReminder(user.id);

    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, link, is_read, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    setNotifications((data || []) as AppNotification[]);
    setLoading(false);
  }, [syncRestScheduleReminder, user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!user) return;
    const interval = window.setInterval(() => {
      void refetch();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [refetch, user]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-user-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          void refetch();

          if (payload.eventType === 'INSERT') {
            const newNotification = payload.new as {
              title?: string;
              message?: string;
            };

            toast.info(newNotification.title || 'Nueva notificación', {
              description: newNotification.message || undefined,
            });

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              new Notification(newNotification.title || 'Nueva notificación', {
                body: newNotification.message || '',
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch, user]);

  const markAsRead = useCallback(async (id: string) => {
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id);

    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n)));
  }, []);

  const markAllAsRead = useCallback(async () => {
    if (!user) return;
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: n.read_at || new Date().toISOString() })));
  }, [user]);

  const createNotification = useCallback(
    async (input: { userId?: string; title: string; message: string; type?: AppNotification['type']; link?: string }) => {
      const targetUserId = input.userId || user?.id;
      if (!targetUserId) return;

      await supabase.from('notifications').insert({
        user_id: targetUserId,
        title: input.title,
        message: input.message,
        type: input.type || 'info',
        link: input.link || null,
      });

      if (targetUserId === user?.id) {
        await refetch();
      }
    },
    [refetch, user?.id]
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.is_read).length, [notifications]);

  return (
    <NotificationsContext.Provider
      value={{ notifications, unreadCount, loading, refetch, markAsRead, markAllAsRead, createNotification }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationsProvider');
  }
  return context;
}
