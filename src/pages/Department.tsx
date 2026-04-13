import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Download,
  Loader2,
  Calendar,
  Search,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { exportToXLSX, formatTime } from '@/lib/xlsx-export';
import { toast } from 'sonner';
import { calculateLateMinutes } from '@/lib/attendance-metrics';
import { useManagedDepartments } from '@/hooks/useManagedDepartments';
import { ReportRunsCard } from '@/components/reports/ReportRunsCard';
import { formatLastConnection } from '@/lib/last-connection';

interface DepartmentEmployee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  last_connection_at: string | null;
}

interface AbsenceReview {
  is_justified: boolean;
  notes: string | null;
}

interface AttendanceSummary {
  userId: string;
  employeeName: string;
  email: string;
  phone: string | null;
  last_connection_at: string | null;
  role: string;
  todayStatus: 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE' | null;
  inTime: string | null;
  outTime: string | null;
  lateMinutes: number;
  insideGeofence: boolean | null;
  distance: number | null;
  absenceReview: AbsenceReview | null;
}

interface AttendanceMonthlyRpcRow {
  date: string;
  employee_name: string;
  employee_email: string;
  department: string;
  status: AttendanceReportRow['status'];
  in_timestamp: string | null;
  out_timestamp: string | null;
  lateness_minutes: number | null;
  absence_justification: AttendanceReportRow['absence_justification'];
  inside_geofence: boolean | null;
  distance_m: number | null;
}

export default function Department() {
  const { profile, user } = useAuth();
  const { departments: managedDepartments } = useManagedDepartments(user?.id, profile?.department_id);
  const [employees, setEmployees] = useState<DepartmentEmployee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [departmentName, setDepartmentName] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>('');
  const [departmentPaused, setDepartmentPaused] = useState(false);
  const [departmentSchedule, setDepartmentSchedule] = useState<{ checkin_end_time: string | null; timezone: string | null }>({
    checkin_end_time: null,
    timezone: null,
  });
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchData = useCallback(async () => {
    if (!selectedDepartmentId) return;
    setLoading(true);

    let currentDepartmentPaused = false;

    // Fetch department name
    const { data: deptData } = await supabase
      .from('departments')
      .select('name, is_paused')
      .eq('id', selectedDepartmentId)
      .single();

    const { data: scheduleData } = await supabase
      .from('department_schedules')
      .select('checkin_end_time, timezone')
      .eq('department_id', selectedDepartmentId)
      .maybeSingle();

    setDepartmentSchedule({
      checkin_end_time: scheduleData?.checkin_end_time ?? null,
      timezone: scheduleData?.timezone ?? null,
    });

    if (deptData) {
      setDepartmentName(deptData.name);
      currentDepartmentPaused = Boolean(deptData.is_paused);
      setDepartmentPaused(currentDepartmentPaused);
    }

    // Fetch employees in department (excluding department heads and global managers)
    const { data: empData } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, phone, last_connection_at')
      .eq('department_id', selectedDepartmentId)
      .eq('is_active', true);

    // Filter out department heads and global managers from attendance statistics
    const { data: excludedRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['department_head', 'global_manager', 'superadmin']);

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('user_id, role');

    const excludedUserIds = new Set(excludedRoles?.map((r) => r.user_id) || []);
    const roleMap = new Map((rolesData || []).map((r) => [r.user_id, r.role]));
    const filteredEmpData = (empData || [])
      .filter((p) => !excludedUserIds.has(p.user_id))
      .map((p) => ({
        ...p,
        role: roleMap.get(p.user_id) || 'employee',
      }));

    if (filteredEmpData.length > 0 || empData) {
      setEmployees(filteredEmpData);

      // Fetch today's attendance for each employee
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const summaries: AttendanceSummary[] = [];
      const todayDate = format(today, 'yyyy-MM-dd');

      const { data: absenceReviews } = await supabase
        .from('attendance_absence_reviews')
        .select('user_id, is_justified, notes')
        .eq('date', todayDate)
        .in('user_id', filteredEmpData.map((emp) => emp.user_id));

      const reviewMap = new Map(
        (absenceReviews || []).map((review) => [review.user_id, { is_justified: review.is_justified, notes: review.notes }])
      );

      for (const emp of filteredEmpData) {
        const { data: marks } = await supabase
          .from('attendance_marks')
          .select('*')
          .eq('user_id', emp.user_id)
          .gte('timestamp', today.toISOString())
          .order('timestamp', { ascending: true });

        const inMark = marks?.find((m) => m.mark_type === 'IN');
        const outMark = marks?.filter((m) => m.mark_type === 'OUT').pop();

        summaries.push({
          userId: emp.user_id,
          employeeName: emp.full_name,
          email: emp.email,
          phone: emp.phone,
          last_connection_at: emp.last_connection_at,
          role: emp.role,
          todayStatus: currentDepartmentPaused
            ? 'NO_LABORABLE'
            : inMark
              ? (calculateLateMinutes(inMark.timestamp, scheduleData?.checkin_end_time ?? null, scheduleData?.timezone ?? null) > 0 ? 'TARDE' : 'PRESENTE')
              : 'AUSENTE',
          inTime: inMark?.timestamp || null,
          outTime: outMark?.timestamp || null,
          lateMinutes: inMark
            ? calculateLateMinutes(inMark.timestamp, scheduleData?.checkin_end_time ?? null, scheduleData?.timezone ?? null)
            : 0,
          insideGeofence: inMark?.inside_geofence ?? null,
          distance: inMark?.distance_to_center ?? null,
          absenceReview: reviewMap.get(emp.user_id) ?? null,
        });
      }

      setAttendance(summaries);
    }

    setLoading(false);
  }, [selectedDepartmentId]);

  useEffect(() => {
    if (managedDepartments.length === 0) {
      setSelectedDepartmentId('');
      return;
    }

    setSelectedDepartmentId((current) =>
      current && managedDepartments.some((department) => department.id === current)
        ? current
        : managedDepartments[0].id
    );
  }, [managedDepartments]);

  useEffect(() => {
    if (selectedDepartmentId) {
      fetchData();
    }
  }, [selectedDepartmentId, fetchData]);

  const handleExport = async () => {
    setExporting(true);

    try {
      const { data, error } = await supabase.rpc('get_attendance_report_monthly', {
        _from: dateRange.from,
        _to: dateRange.to,
        _department_id: selectedDepartmentId,
        _scope: 'department',
        _include_heads: false,
      });

      if (error) throw error;

      const rows = (data || []) as AttendanceMonthlyRpcRow[];
      exportToXLSX(
        rows.map((row) => ({
          date: row.date,
          employee_name: row.employee_name,
          employee_email: row.employee_email,
          department: row.department,
          status: row.status,
          in_time: row.in_timestamp,
          out_time: row.out_timestamp,
          lateness_minutes: row.lateness_minutes,
          inside_geofence: row.inside_geofence,
          distance_m: row.distance_m,
          absence_justification: row.absence_justification,
        })),
        `reporte-${departmentName || 'departamento'}-${dateRange.from}-${dateRange.to}`
      );

      toast.success(`Reporte XLSX generado (${rows.length} filas).`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al generar reporte XLSX';
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  const metrics = {
    total: employees.length,
    present: attendance.filter((a) => a.todayStatus === 'PRESENTE' || a.todayStatus === 'TARDE').length,
    absent: attendance.filter((a) => a.todayStatus === 'AUSENTE').length,
  };

  const handleSetAbsenceReview = async (targetUserId: string, isJustified: boolean) => {
    try {
      setReviewingUserId(targetUserId);
      const todayDate = format(new Date(), 'yyyy-MM-dd');

      const { data: sessionData } = await supabase.auth.getUser();
      const reviewerId = sessionData.user?.id;

      if (!reviewerId) {
        toast.error('No se pudo identificar al gestor que revisa.');
        return;
      }

      const { error } = await supabase
        .from('attendance_absence_reviews')
        .upsert(
          {
            user_id: targetUserId,
            date: todayDate,
            is_justified: isJustified,
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,date' }
        );

      if (error) throw error;

      setAttendance((prev) =>
        prev.map((row) =>
          row.userId === targetUserId
            ? {
                ...row,
                absenceReview: {
                  is_justified: isJustified,
                  notes: null,
                },
              }
            : row
        )
      );

      toast.success(`Ausencia marcada como ${isJustified ? 'justificada' : 'no justificada'}.`);
    } catch {
      toast.error('No se pudo actualizar la justificación de ausencia.');
    } finally {
      setReviewingUserId(null);
    }
  };

  const filteredAttendance = attendance.filter(
    (a) =>
      a.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{departmentName}</h1>
            <p className="text-muted-foreground">Panel del departamento</p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange((p) => ({ ...p, from: e.target.value }))}
              className="w-auto"
            />
            <span className="text-muted-foreground">-</span>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange((p) => ({ ...p, to: e.target.value }))}
              className="w-auto"
            />
            <Button onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  XLSX
                </>
              )}
            </Button>
          </div>
        </div>

        {managedDepartments.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Departamento activo</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedDepartmentId} onValueChange={setSelectedDepartmentId}>
                <SelectTrigger className="max-w-sm">
                  <SelectValue placeholder="Selecciona un departamento" />
                </SelectTrigger>
                <SelectContent>
                  {managedDepartments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            title="Total Empleados"
            value={metrics.total}
            icon={Users}
            variant="default"
          />
          <MetricCard
            title="Presentes Hoy"
            value={metrics.present}
            icon={UserCheck}
            variant="success"
          />
          <MetricCard
            title="Ausentes Hoy"
            value={metrics.absent}
            icon={UserX}
            variant="destructive"
          />
        </div>

        {/* Employee Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Asistencia de hoy</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar empleado..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-full sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Tardanza</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Ausencia</TableHead>
                    <TableHead>Última conexión</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          <p className="text-xs text-muted-foreground">Tel: {row.phone || 'No registrado'} · Rol: {row.role}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.todayStatus ? (
                          <StatusBadge status={row.todayStatus} />
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.lateMinutes > 0 ? (
                          <span className="text-amber-600 font-medium">{row.lateMinutes} min</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.inTime ? formatTime(row.inTime) : '-'}
                      </TableCell>
                      <TableCell>
                        {row.outTime ? formatTime(row.outTime) : '-'}
                      </TableCell>
                      <TableCell>
                        {row.insideGeofence !== null && (
                          <span
                            className={
                              row.insideGeofence
                                ? 'text-success text-sm'
                                : 'text-destructive text-sm'
                            }
                          >
                            {row.insideGeofence ? '✓ Dentro' : '✗ Fuera'}
                            {row.distance && ` (${row.distance}m)`}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.todayStatus === 'AUSENTE' ? (
                          <div className="flex flex-wrap gap-1">
                            <Button
                              size="sm"
                              variant={row.absenceReview?.is_justified ? 'default' : 'outline'}
                              disabled={reviewingUserId === row.userId}
                              onClick={() => handleSetAbsenceReview(row.userId, true)}
                            >
                              Justificada
                            </Button>
                            <Button
                              size="sm"
                              variant={row.absenceReview && !row.absenceReview.is_justified ? 'destructive' : 'outline'}
                              disabled={reviewingUserId === row.userId}
                              onClick={() => handleSetAbsenceReview(row.userId, false)}
                            >
                              No justificada
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatLastConnection(row.last_connection_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <ReportRunsCard
          scope="department"
          departmentId={selectedDepartmentId || null}
          title="Ejecuciones de reportes del departamento"
        />
      </div>
    </AppLayout>
  );
}
