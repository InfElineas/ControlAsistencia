import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function StatusPill({
  tone,
  children,
}: {
  tone: 'ok' | 'warning' | 'error';
  children: React.ReactNode;
}) {
  return (
    <Badge
      className={cn(
        'rounded-full px-3 py-1 text-xs font-semibold',
        tone === 'ok' && 'bg-success/15 text-success border-success/30',
        tone === 'warning' && 'bg-warning/15 text-warning border-warning/30',
        tone === 'error' && 'bg-destructive/15 text-destructive border-destructive/30'
      )}
      variant="outline"
    >
      {children}
    </Badge>
  );
}
