import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkLocations } from '@/hooks/useWorkLocations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export function WorkLocationSelector() {
  const { role, user } = useAuth();
  const { locations, loading, activeLocationId, setActiveLocation } = useWorkLocations();
  const [selected, setSelected] = useState<string>('');

  const shouldShow = useMemo(() => {
    if (!user) return false;
    if (role === 'global_manager' || role === 'superadmin') return false;
    if (loading) return false;
    if (locations.length <= 1) return false;
    return !activeLocationId;
  }, [activeLocationId, loading, locations.length, role, user]);

  useEffect(() => {
    if (!selected && locations.length > 0) {
      setSelected(locations[0].id);
    }
  }, [locations, selected]);

  const onConfirm = () => {
    if (!selected) return;
    setActiveLocation(selected);
    window.location.reload();
  };

  return (
    <Dialog open={shouldShow}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Selecciona ubicación de trabajo</DialogTitle>
          <DialogDescription>Antes de marcar asistencia, indica en qué ubicación trabajarás hoy.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue placeholder="Ubicación" />
            </SelectTrigger>
            <SelectContent>
              {locations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="w-full" onClick={onConfirm} disabled={!selected}>
            Confirmar ubicación
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
