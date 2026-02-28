import { Button } from '@/components/ui/button';

export function PrimaryActionButton({
  label,
  disabled,
  loading,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      className="h-16 w-full rounded-2xl text-base font-bold tracking-wide shadow-md"
      onClick={onClick}
      disabled={disabled || loading}
    >
      {loading ? 'Procesando...' : label}
    </Button>
  );
}
