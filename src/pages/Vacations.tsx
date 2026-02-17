import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, PlaneTakeoff, CheckCircle2, XCircle, CircleDashed } from 'lucide-react';
import { useVacations, type VacationStatus } from '@/hooks/useVacations';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

function statusLabel(status: VacationStatus): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'approved':
      return 'Aprobada';
    case 'rejected':
      return 'Rechazada';
    case 'cancelled':
      return 'Cancelada';
  }
}

function statusVariant(status: VacationStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'approved':
      return 'default';
    case 'pending':
      return 'secondary';
    case 'rejected':
      return 'destructive';
    case 'cancelled':
      return 'outline';
  }
}

export default function Vacations() {
  const {
    loading,
    error,
    balance,
    myRequests,
    reviewQueue,
    canReview,
    requestVacation,
    cancelRequest,
    reviewRequest,
  } = useVacations();

  const [form, setForm] = useState({
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({});

  const requestedDaysPreview = useMemo(() => {
    if (!form.startDate || !form.endDate) return 0;
    const start = new Date(form.startDate);
    const end = new Date(form.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return 0;
    }

    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  }, [form.endDate, form.startDate]);

  const handleSubmit = async () => {
    if (!form.startDate || !form.endDate) {
      toast.error('Debes seleccionar fecha de inicio y fin');
      return;
    }

    setBusy(true);
    const { error: submitError } = await requestVacation(form.startDate, form.endDate, form.reason);
    if (submitError) {
      toast.error(submitError);
    } else {
      toast.success('Solicitud enviada correctamente');
      setForm({ startDate: '', endDate: '', reason: '' });
    }
    setBusy(false);
  };

  const handleCancel = async (requestId: string) => {
    setBusy(true);
    const { error: cancelError } = await cancelRequest(requestId);
    if (cancelError) {
      toast.error(cancelError);
    } else {
      toast.success('Solicitud cancelada');
    }
    setBusy(false);
  };

  const handleReview = async (requestId: string, decision: 'approved' | 'rejected') => {
    setBusy(true);
    const { error: reviewError } = await reviewRequest(requestId, decision, reviewComment[requestId]);
    if (reviewError) {
      toast.error(reviewError);
    } else {
      toast.success(decision === 'approved' ? 'Solicitud aprobada' : 'Solicitud rechazada');
      setReviewComment((prev) => ({ ...prev, [requestId]: '' }));
    }
    setBusy(false);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Vacaciones</h1>
          <p className="text-muted-foreground">Solicita, consulta y gestiona vacaciones acumuladas por días trabajados.</p>
        </div>

        {error && (
          <Card>
            <CardContent className="pt-6 text-destructive">{error}</CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Días trabajados (año actual)</CardDescription>
              <CardTitle>{balance.worked_days}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Tasa acumulación</CardDescription>
              <CardTitle>{balance.accrual_rate.toFixed(4)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Días acumulados</CardDescription>
              <CardTitle>{balance.earned_days.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saldo disponible</CardDescription>
              <CardTitle>{balance.available_days.toFixed(2)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PlaneTakeoff className="h-5 w-5" />
              Solicitar vacaciones
            </CardTitle>
            <CardDescription>
              Las vacaciones se validan contra tu saldo acumulado según días trabajados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start-date">Fecha inicio</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">Fecha fin</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Motivo (opcional)</Label>
              <Textarea
                id="reason"
                value={form.reason}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                placeholder="Describe el motivo de tu solicitud"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-muted-foreground">Días solicitados (aprox): {requestedDaysPreview}</p>
              <Button onClick={handleSubmit} disabled={busy || loading}>
                {(busy || loading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Enviar solicitud
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mis solicitudes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myRequests.length === 0 && <p className="text-sm text-muted-foreground">Aún no tienes solicitudes.</p>}
            {myRequests.map((request) => (
              <div key={request.id} className="rounded-lg border p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">
                    {format(new Date(request.start_date), 'dd MMM yyyy', { locale: es })} -{' '}
                    {format(new Date(request.end_date), 'dd MMM yyyy', { locale: es })}
                  </p>
                  <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{request.requested_days} día(s)</p>
                {request.reason && <p className="text-sm">{request.reason}</p>}
                {request.review_comment && (
                  <p className="text-xs text-muted-foreground">Comentario revisión: {request.review_comment}</p>
                )}
                {request.status === 'pending' && (
                  <Button variant="outline" size="sm" onClick={() => handleCancel(request.id)} disabled={busy}>
                    Cancelar solicitud
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {canReview && (
          <Card>
            <CardHeader>
              <CardTitle>Bandeja de aprobación</CardTitle>
              <CardDescription>Solicitudes pendientes de revisión.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviewQueue.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
              )}
              {reviewQueue.map((request) => (
                <div key={request.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">Usuario: {request.user_id}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(request.start_date), 'dd MMM yyyy', { locale: es })} -{' '}
                        {format(new Date(request.end_date), 'dd MMM yyyy', { locale: es })} · {request.requested_days} día(s)
                      </p>
                    </div>
                    <Badge variant="secondary">
                      <CircleDashed className="h-3 w-3 mr-1" /> Pendiente
                    </Badge>
                  </div>

                  {request.reason && <p className="text-sm">{request.reason}</p>}

                  <Textarea
                    placeholder="Comentario de revisión (opcional)"
                    value={reviewComment[request.id] || ''}
                    onChange={(event) =>
                      setReviewComment((prev) => ({
                        ...prev,
                        [request.id]: event.target.value,
                      }))
                    }
                  />

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleReview(request.id, 'approved')}
                      disabled={busy}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleReview(request.id, 'rejected')}
                      disabled={busy}
                    >
                      <XCircle className="h-4 w-4 mr-1" /> Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
