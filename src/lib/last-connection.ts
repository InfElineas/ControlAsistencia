import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export function formatLastConnection(lastConnectionAt: string | null | undefined): string {
  if (!lastConnectionAt) return 'Sin registro';

  const parsedDate = new Date(lastConnectionAt);
  if (Number.isNaN(parsedDate.getTime())) return 'Sin registro';

  return format(parsedDate, "dd/MM/yyyy HH:mm", { locale: es });
}
