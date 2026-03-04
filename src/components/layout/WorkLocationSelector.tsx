import { useEffect, useMemo, useState } from 'react';
import { MapPin } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkLocations } from '@/hooks/useWorkLocations';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export function WorkLocationSelector() {
  const { role, user } = useAuth();
  const { locations, loading, storageReady, activeLocationId, setActiveLocation } = useWorkLocations();
  const [selected, setSelected] = useState<string>('');
  const [manualOpen, setManualOpen] = useState(false);

  const canUseSelector = useMemo(() => {
    if (!user) return false;
    if (role === 'global_manager' || role === 'superadmin') return false;
    if (loading || !storageReady) return false;
    if (locations.length === 0) return false;
    return true;
  }, [loading, locations.length, role, storageReady, user]);

  const mustChooseOnLogin = canUseSelector && !activeLocationId;
  const dialogOpen = mustChooseOnLogin || manualOpen;

  const currentLocationName = useMemo(
    () => locations.find((location) => location.id === activeLocationId)?.name ?? null,
    [activeLocationId, locations]
  );

  useEffect(() => {
    if (!selected && locations.length > 0) {
      setSelected(activeLocationId ?? locations[0].id);
    }
  }, [activeLocationId, locations, selected]);

  useEffect(() => {
    if (!activeLocationId) return;
    if (locations.some((item) => item.id === activeLocationId)) return;
    setSelected('');
  }, [activeLocationId, locations]);

  const onConfirm = () => {
    if (!selected) return;
    setActiveLocation(selected);
    setManualOpen(false);
  };

  return (
    <>
      {canUseSelector && activeLocationId && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="fixed bottom-4 right-4 z-40 shadow-md"
          onClick={() => setManualOpen(true)}
        >
          <MapPin className="h-4 w-4 mr-2" />
          {currentLocationName ? `Ubicación: ${currentLocationName}` : 'Cambiar ubicación'}
        </Button>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          if (mustChooseOnLogin && !nextOpen) return;
          setManualOpen(nextOpen);
        }}
      >
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
    </>
  );
}
