import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, link, is_read, created_at, read_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    setNotifications((data || []) as AppNotification[]);
    setLoading(false);
  }, [user]);

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
