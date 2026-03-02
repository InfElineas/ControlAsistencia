import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotifications } from '@/contexts/NotificationsContext';
import { cn } from '@/lib/utils';

export function NotificationBell({ className }: { className?: string }) {
  const { unreadCount } = useNotifications();

  return (
    <Link to="/notifications" className={cn('relative inline-flex h-10 w-10 items-center justify-center rounded-xl border bg-background', className)}>
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-destructive px-1.5 text-center text-[10px] font-bold text-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </Link>
  );
}
