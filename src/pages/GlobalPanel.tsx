import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Download,
  Loader2,
  Search,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { format, startOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatTime } from '@/lib/xlsx-export';
import { toast } from 'sonner';
import { useDepartments } from '@/hooks/useDepartments';
import { calculateLateMinutes } from '@/lib/attendance-metrics';
import { ReportRunsCard } from '@/components/reports/ReportRunsCard';
import { formatLastConnection } from '@/lib/last-connection';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: string;
  department_id: string;
  department_name: string;
  department_paused: boolean;
  last_connection_at: string | null;
}

interface ProfileWithDepartment {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  last_connection_at: string | null;
  department_id: string;
  departments: { name: string; is_paused: boolean } | null;
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
  department: string;
  todayStatus: 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE' | null;
  inTime: string | null;
  outTime: string | null;
  lateMinutes: number;
  insideGeofence: boolean | null;
  distance: number | null;
  absenceReview: AbsenceReview | null;
}

const ATTENDANCE_PAGE_SIZE = 10;

interface EmployeeDetails {
  monthPresentDays: number;
  monthLateCheckins: number;
  monthOutsideGeofence: number;
  monthWorkedHours: number;
  monthInMarks: number;
  lastActivityAt: string | null;
  vacation: {
    availableDays: number;
    earnedDays: number;
    approvedDays: number;
    pendingDays: number;
    workedDays: number;
  };
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

export default function GlobalPanel() {
  const { departments } = useDepartments();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [includeHeadsInGlobalReports, setIncludeHeadsInGlobalReports] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetails | null>(null);
  const [deparmentScheduleMap, setDepartmentScheduleMap] = useState<Record<string, { checkin_end_time: string | null; timezone: string | null }>>({});
  const [reviewingUserId, setReviewingUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);

    // Load config to determine whether to include department heads
    const { data: configData } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'include_heads_in_global_reports')
      .maybeSingle();

    const includeHeads = configData?.value === true;
    setIncludeHeadsInGlobalReports(includeHeads);

    // Fetch all employees (excluding department heads based on config)
    // First get all profiles with their departments
    const { data: profilesData } = await supabase
      .from('profiles')
      .select(`
        id,
        user_id,
        full_name,
        email,
        phone,
        last_connection_at,
        department_id,
        departments(name, is_paused)
      `)
      .eq('is_active', true);

    const { data: schedulesData } = await supabase
      .from('department_schedules')
      .select('department_id, checkin_end_time, timezone');

    setDepartmentScheduleMap(
      Object.fromEntries(
        (schedulesData || []).map((item) => [
          item.department_id,
          { checkin_end_time: item.checkin_end_time, timezone: item.timezone },
        ])
      )
    );

    if (profilesData) {
      // Filter out department heads and global managers (they are not part of attendance statistics)
      const rolesToExclude = includeHeads ? ['global_manager', 'superadmin'] : ['department_head', 'global_manager', 'superadmin'];

      const { data: excludedRoles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', rolesToExclude);

      const { data: allRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const excludedUserIds = new Set(excludedRoles?.map((r) => r.user_id) || []);
      const roleMap = new Map((allRoles || []).map((r) => [r.user_id, r.role]));

      const typedProfiles = (profilesData || []) as ProfileWithDepartment[];

      const filteredEmployees = typedProfiles
        .filter((p) => !excludedUserIds.has(p.user_id))
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          phone: p.phone,
          last_connection_at: p.last_connection_at,
          role: roleMap.get(p.user_id) || 'employee',
          department_id: p.department_id,
          department_name: p.departments?.name || 'Sin departamento',
          department_paused: p.departments?.is_paused ?? false,
        }));

      setEmployees(filteredEmployees);

      // Fetch today's attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const summaries: AttendanceSummary[] = [];
      const todayDate = format(today, 'yyyy-MM-dd');
      const employeeIds = filteredEmployees.map((emp) => emp.user_id);

      const [{ data: absenceReviews }, { data: allTodayMarks }] = await Promise.all([
        supabase
          .from('attendance_absence_reviews')
          .select('user_id, is_justified, notes')
          .eq('date', todayDate)
          .in('user_id', employeeIds),
        supabase
          .from('attendance_marks')
          .select('*')
          .gte('timestamp', today.toISOString())
          .in('user_id', employeeIds)
          .order('timestamp', { ascending: true }),
      ]);

      const reviewMap = new Map(
        (absenceReviews || []).map((review) => [review.user_id, { is_justified: review.is_justified, notes: review.notes }])
      );

      const marksByUser = new Map<string, Array<{
        mark_type: string;
        timestamp: string;
        inside_geofence: boolean | null;
        distance_to_center: number | null;
      }>>();

      (allTodayMarks || []).forEach((mark) => {
        const existing = marksByUser.get(mark.user_id) || [];
        existing.push(mark);
        marksByUser.set(mark.user_id, existing);
      });

      const scheduleMap = new Map(
        (schedulesData || []).map((item) => [item.department_id, item])
      );

      for (const emp of filteredEmployees) {
        const marks = marksByUser.get(emp.user_id) || [];
        const inMark = marks.find((m) => m.mark_type === 'IN');
        const outMark = marks.filter((m) => m.mark_type === 'OUT').pop();

        const schedule = scheduleMap.get(emp.department_id);
        const lateMinutes = inMark
          ? calculateLateMinutes(inMark.timestamp, schedule?.checkin_end_time ?? null, schedule?.timezone ?? null)
          : 0;

        summaries.push({
          userId: emp.user_id,
          employeeName: emp.full_name,
          email: emp.email,
          phone: emp.phone,
          last_connection_at: emp.last_connection_at,
          role: emp.role,
          department: emp.department_name,
          todayStatus: emp.department_paused ? 'NO_LABORABLE' : inMark ? (lateMinutes > 0 ? 'TARDE' : 'PRESENTE') : 'AUSENTE',
          inTime: inMark?.timestamp || null,
          outTime: outMark?.timestamp || null,
          lateMinutes,
          insideGeofence: inMark?.inside_geofence ?? null,
          distance: inMark?.distance_to_center ?? null,
          absenceReview: reviewMap.get(emp.user_id) ?? null,
        });
      }

      setAttendance(summaries);
    }

    setLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        throw new Error('Tu sesión expiró. Inicia sesión nuevamente para generar reportes.');
      }

      const { data, error } = await supabase.functions.invoke('generate-monthly-report', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: {
          from: dateRange.from,
          to: dateRange.to,
          scope: 'global',
          department_id: null,
          include_heads: includeHeadsInGlobalReports,
          format: 'csv',
        },
      });

      if (error) throw error;

      toast.success(`Reporte generado. Run ID: ${data?.run_id ?? '-'}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Error al generar el reporte mensual asíncrono';
      toast.error(message);
    }

    setExporting(false);
  };

  const openEmployeeDetails = async (employeeId: string) => {
    const employee = employees.find((item) => item.user_id === employeeId);
    if (!employee) return;

    setSelectedEmployee(employee);
    setEmployeeDetails(null);
    setDetailsOpen(true);
    setDetailsLoading(true);

    try {
      const monthStart = startOfMonth(new Date());

      const [{ data: monthMarks, error: marksError }, { data: lastMark, error: lastError }, { data: vacationData, error: vacationError }] = await Promise.all([
        supabase
          .from('attendance_marks')
          .select('mark_type, timestamp, inside_geofence, block_reason')
          .eq('user_id', employeeId)
          .gte('timestamp', monthStart.toISOString())
          .order('timestamp', { ascending: true }),
        supabase
          .from('attendance_marks')
          .select('timestamp')
          .eq('user_id', employeeId)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .rpc('get_vacation_balance', { _user_id: employeeId, _year: new Date().getFullYear() }),
      ]);

      if (marksError) throw marksError;
      if (lastError) throw lastError;
      if (vacationError) throw vacationError;

      const marks = monthMarks || [];
      const uniqueInDays = new Set(
        marks
          .filter((mark) => mark.mark_type === 'IN')
          .map((mark) => mark.timestamp.split('T')[0])
      );

      const lateCheckins = marks.filter(
        (mark) => mark.mark_type === 'IN' && mark.block_reason === 'LATE_CHECKIN'
      ).length;

      const outsideGeofenceCount = marks.filter(
        (mark) => mark.mark_type === 'IN' && !mark.inside_geofence
      ).length;

      const workedHours = marks.reduce((total, mark, index) => {
        if (mark.mark_type !== 'IN') return total;
        const outMark = marks.slice(index + 1).find((candidate) => candidate.mark_type === 'OUT');
        if (!outMark) return total;

        const diffMs = new Date(outMark.timestamp).getTime() - new Date(mark.timestamp).getTime();
        return diffMs > 0 ? total + diffMs / (1000 * 60 * 60) : total;
      }, 0);

      const vacation = vacationData?.[0];

      setEmployeeDetails({
        monthPresentDays: uniqueInDays.size,
        monthLateCheckins: lateCheckins,
        monthOutsideGeofence: outsideGeofenceCount,
        monthWorkedHours: workedHours,
        monthInMarks: marks.filter((mark) => mark.mark_type === 'IN').length,
        lastActivityAt: lastMark?.timestamp || null,
        vacation: {
          availableDays: vacation?.available_days ?? 0,
          earnedDays: vacation?.earned_days ?? 0,
          approvedDays: vacation?.approved_days ?? 0,
          pendingDays: vacation?.pending_days ?? 0,
          workedDays: vacation?.worked_days ?? 0,
        },
      });
    } catch (error) {
      toast.error('No se pudieron cargar los detalles del trabajador');
    }

    setDetailsLoading(false);
  };

  const scopedAttendance = useMemo(
    () => (selectedDept === 'all' ? attendance : attendance.filter((row) => row.department === selectedDept)),
    [attendance, selectedDept]
  );

  const departmentHeadcount = useMemo(() => {
    type DepartmentSummary = {
      department: string;
      total: number;
      ok: number;
      late: number;
      rest: number;
      absent: number;
    };

    const map = new Map<string, DepartmentSummary>();

    attendance.forEach((row) => {
      if (!map.has(row.department)) {
        map.set(row.department, {
          department: row.department,
          total: 0,
          ok: 0,
          late: 0,
          rest: 0,
          absent: 0,
        });
      }

      const current = map.get(row.department)!;
      current.total += 1;

      if (row.todayStatus === 'PRESENTE') current.ok += 1;
      else if (row.todayStatus === 'TARDE') current.late += 1;
      else if (row.todayStatus === 'DESCANSO' || row.todayStatus === 'NO_LABORABLE') current.rest += 1;
      else if (row.todayStatus === 'AUSENTE') current.absent += 1;
    });

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [attendance]);

  const metrics = {
    total: scopedAttendance.length,
    present: scopedAttendance.filter((a) => a.todayStatus === 'PRESENTE' || a.todayStatus === 'TARDE').length,
    absent: scopedAttendance.filter((a) => a.todayStatus === 'AUSENTE').length,
    late: scopedAttendance.filter((a) => a.todayStatus === 'TARDE').length,
    compliance:
      scopedAttendance.length > 0
        ? Math.round(
            (scopedAttendance.filter((a) => a.todayStatus === 'PRESENTE' || a.todayStatus === 'TARDE').length /
              scopedAttendance.length) *
              100
          )
        : 0,
  };

  const filteredAttendance = attendance.filter((a) => {
    const matchesSearch =
      a.employeeName.toLowerCase().includes(search.toLowerCase()) ||
      a.email.toLowerCase().includes(search.toLowerCase());
    const matchesDept = selectedDept === 'all' || a.department === selectedDept;
    return matchesSearch && matchesDept;
  });

  const totalPages = Math.max(1, Math.ceil(filteredAttendance.length / ATTENDANCE_PAGE_SIZE));
  const paginatedAttendance = useMemo(() => {
    const start = (currentPage - 1) * ATTENDANCE_PAGE_SIZE;
    return filteredAttendance.slice(start, start + ATTENDANCE_PAGE_SIZE);
  }, [currentPage, filteredAttendance]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedDept]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

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
            ? { ...row, absenceReview: { is_justified: isJustified, notes: null } }
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
            <h1 className="text-2xl font-bold">Panel Global</h1>
            <p className="text-muted-foreground">
              Vista general de todos los empleados · Jefes incluidos: {includeHeadsInGlobalReports ? 'Sí' : 'No'} · Filtro: {selectedDept === 'all' ? 'Todos los departamentos' : selectedDept}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
                  XLSX Global
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Metrics */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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

          <MetricCard
            title="Tardanzas Hoy"
            value={metrics.late}
            icon={Clock}
            variant="warning"
          />
          <MetricCard
            title="Cumplimiento"
            value={`${metrics.compliance}%`}
            icon={TrendingUp}
            variant="default"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Trabajadores por departamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {departmentHeadcount.map((item) => (
                <div key={item.department} className="rounded-xl border p-3 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{item.department}</span>
                    <span className="text-muted-foreground">{item.total}</span>
                  </div>

                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    {item.total > 0 && (
                      <div className="flex h-full w-full">
                        <div className="bg-emerald-500" style={{ width: `${(item.ok / item.total) * 100}%` }} />
                        <div className="bg-amber-500" style={{ width: `${(item.late / item.total) * 100}%` }} />
                        <div className="bg-sky-500" style={{ width: `${(item.rest / item.total) * 100}%` }} />
                        <div className="bg-rose-500" style={{ width: `${(item.absent / item.total) * 100}%` }} />
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Ok: {item.ok}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Tarde: {item.late}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> Descanso: {item.rest}</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-500" /> Ausente: {item.absent}</span>
                  </div>
                </div>
              ))}
            </div>

          </CardContent>
        </Card>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <CardTitle>Asistencia de hoy</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.name}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 w-full sm:w-64"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Departamento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Tardanza</TableHead>
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead>Ubicación</TableHead>
                    <TableHead>Ausencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedAttendance.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
                          <p className="text-xs text-muted-foreground">Tel: {row.phone || 'No registrado'} · Rol: {row.role}</p>
                          <p className="text-xs text-muted-foreground">Última conexión: {formatLastConnection(row.last_connection_at)}</p>
                        </div>
                      </TableCell>
                      <TableCell>{row.department}</TableCell>
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
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEmployeeDetails(row.userId)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Ver detalles
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ATTENDANCE_PAGE_SIZE + 1}-{Math.min(currentPage * ATTENDANCE_PAGE_SIZE, filteredAttendance.length)} de {filteredAttendance.length} registros
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage <= 1}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground">Página {currentPage} de {totalPages}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <ReportRunsCard scope="global" title="Ejecuciones de reportes globales" />

        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalle de trabajador</DialogTitle>
              <DialogDescription>
                {selectedEmployee
                  ? `${selectedEmployee.full_name} · ${selectedEmployee.department_name}`
                  : 'Métricas de asistencia y vacaciones'}
              </DialogDescription>
            </DialogHeader>

            {detailsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : employeeDetails ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Asistencia (mes actual)</p>
                    <p className="text-xl font-semibold">{employeeDetails.monthPresentDays} días</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Última actividad</p>
                    <p className="text-sm font-medium">
                      {employeeDetails.lastActivityAt
                        ? format(new Date(employeeDetails.lastActivityAt), "dd 'de' MMM yyyy, HH:mm", { locale: es })
                        : 'Sin registros'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Horas trabajadas (mes actual)</p>
                    <p className="text-xl font-semibold">{employeeDetails.monthWorkedHours.toFixed(1)} h</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Entradas con tardanza</p>
                    <p className="text-xl font-semibold">{employeeDetails.monthLateCheckins}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Entradas fuera de geocerca</p>
                    <p className="text-xl font-semibold">{employeeDetails.monthOutsideGeofence}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-muted-foreground">Marcajes de entrada (mes actual)</p>
                    <p className="text-xl font-semibold">{employeeDetails.monthInMarks}</p>
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2">
                  <CardContent className="pt-4 space-y-1">
                    <p className="text-muted-foreground">Vacaciones</p>
                    <p>Días acumulados: <span className="font-semibold">{employeeDetails.vacation.earnedDays.toFixed(2)}</span></p>
                    <p>Días disponibles: <span className="font-semibold">{employeeDetails.vacation.availableDays.toFixed(2)}</span></p>
                    <p>Días aprobados: <span className="font-semibold">{employeeDetails.vacation.approvedDays.toFixed(2)}</span></p>
                    <p>Días pendientes: <span className="font-semibold">{employeeDetails.vacation.pendingDays.toFixed(2)}</span></p>
                    <p>Días trabajados del año: <span className="font-semibold">{employeeDetails.vacation.workedDays}</span></p>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hay datos para mostrar.</p>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
