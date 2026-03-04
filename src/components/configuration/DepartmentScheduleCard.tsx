import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Clock, Building2 } from 'lucide-react';

interface Schedule {
  id: string;
  department_id: string;
  checkin_start_time: string;
  checkin_end_time: string;
  checkout_start_time: string | null;
  checkout_end_time: string | null;
  allow_early_checkin: boolean;
  allow_late_checkout: boolean;
}



interface Props {
  departmentId: string;
  departmentName: string;
  isPaused: boolean;
  schedule: Schedule | null;
  onSave: (departmentId: string, data: {
    checkin_start_time: string;
    checkin_end_time: string;
    checkout_start_time?: string | null;
    checkout_end_time?: string | null;
    allow_early_checkin?: boolean;
    allow_late_checkout?: boolean;
  }) => Promise<{ error: string | null }>;
  onTogglePause: (departmentId: string, isPaused: boolean) => Promise<{ error: string | null }>;
}

export function DepartmentScheduleCard({ departmentId, departmentName, isPaused, schedule, onSave, onTogglePause }: Props) {
  const [saving, setSaving] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [form, setForm] = useState({
    checkin_start_time: schedule?.checkin_start_time?.slice(0, 5) || '08:00',
    checkin_end_time: schedule?.checkin_end_time?.slice(0, 5) || '09:00',
    checkout_start_time: schedule?.checkout_start_time?.slice(0, 5) || '17:00',
    checkout_end_time: schedule?.checkout_end_time?.slice(0, 5) || '19:00',
    allow_early_checkin: schedule?.allow_early_checkin ?? false,
    allow_late_checkout: schedule?.allow_late_checkout ?? true,
  });

  useEffect(() => {
    if (schedule) {
      setForm({
        checkin_start_time: schedule.checkin_start_time?.slice(0, 5) || '08:00',
        checkin_end_time: schedule.checkin_end_time?.slice(0, 5) || '09:00',
        checkout_start_time: schedule.checkout_start_time?.slice(0, 5) || '17:00',
        checkout_end_time: schedule.checkout_end_time?.slice(0, 5) || '19:00',
        allow_early_checkin: schedule.allow_early_checkin ?? false,
        allow_late_checkout: schedule.allow_late_checkout ?? true,
      });
    }
  }, [schedule]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(departmentId, {
      checkin_start_time: form.checkin_start_time + ':00',
      checkin_end_time: form.checkin_end_time + ':00',
      checkout_start_time: form.checkout_start_time + ':00',
      checkout_end_time: form.checkout_end_time + ':00',
      allow_early_checkin: form.allow_early_checkin,
      allow_late_checkout: form.allow_late_checkout,
    });
    setSaving(false);
  };

  const handleTogglePause = async () => {
    setTogglingPause(true);
    await onTogglePause(departmentId, !isPaused);
    setTogglingPause(false);
  };

  const hasChanges = schedule
    ? form.checkin_start_time !== schedule.checkin_start_time?.slice(0, 5) ||
      form.checkin_end_time !== schedule.checkin_end_time?.slice(0, 5) ||
      form.checkout_start_time !== schedule.checkout_start_time?.slice(0, 5) ||
      form.checkout_end_time !== schedule.checkout_end_time?.slice(0, 5) ||
      form.allow_early_checkin !== schedule.allow_early_checkin ||
      form.allow_late_checkout !== schedule.allow_late_checkout
    : true;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          {departmentName}
          {isPaused && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Sin descanso</span>}
          {!schedule && (
            <span className="text-xs font-normal text-warning ml-auto">Sin configurar</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Entrada desde
            </Label>
            <Input
              type="time"
              value={form.checkin_start_time}
              onChange={(e) => setForm((p) => ({ ...p, checkin_start_time: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Entrada hasta
            </Label>
            <Input
              type="time"
              value={form.checkin_end_time}
              onChange={(e) => setForm((p) => ({ ...p, checkin_end_time: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Salida desde</Label>
            <Input
              type="time"
              value={form.checkout_start_time}
              onChange={(e) => setForm((p) => ({ ...p, checkout_start_time: e.target.value }))}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Salida hasta</Label>
            <Input
              type="time"
              value={form.checkout_end_time}
              onChange={(e) => setForm((p) => ({ ...p, checkout_end_time: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Permitir entrada anticipada</Label>
            <Switch
              checked={form.allow_early_checkin}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, allow_early_checkin: checked }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Permitir salida tardía</Label>
            <Switch
              checked={form.allow_late_checkout}
              onCheckedChange={(checked) => setForm((p) => ({ ...p, allow_late_checkout: checked }))}
            />
          </div>
        </div>

        <div className="flex items-center justify-between rounded-md bg-secondary/40 px-3 py-2">
          <div>
            <Label className="text-sm font-medium">Modo sin descanso por departamento</Label>
            <p className="text-xs text-muted-foreground">
              {isPaused ? 'Activado: no aplica descanso automático.' : 'Desactivado: usa reglas de descanso configuradas.'}
            </p>
          </div>
          {togglingPause ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <Switch checked={isPaused} onCheckedChange={() => void handleTogglePause()} />
          )}
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          size="sm"
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Guardar horario
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
