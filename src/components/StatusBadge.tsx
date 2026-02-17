import { cn } from '@/lib/utils';

type Status = 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<Status, { label: string; className: string }> = {
  PRESENTE: { label: 'Presente', className: 'status-present' },
  TARDE: { label: 'Tarde', className: 'status-late' },
  AUSENTE: { label: 'Ausente', className: 'status-absent' },
  DESCANSO: { label: 'Descanso', className: 'status-rest' },
  NO_LABORABLE: { label: 'No laborable', className: 'status-nonworking' },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return <span className={cn('status-badge shadow-sm border border-transparent', config.className, className)}>{config.label}</span>;
}
