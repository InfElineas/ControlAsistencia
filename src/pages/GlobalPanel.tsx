import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { StatusBadge } from '@/components/StatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { exportToXLSX, AttendanceReportRow, formatTime } from '@/lib/xlsx-export';
import { toast } from 'sonner';
import { useDepartments } from '@/hooks/useDepartments';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department_id: string;
  department_name: string;
  department_paused: boolean;
}

interface ProfileWithDepartment {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department_id: string;
  departments: { name: string; is_paused: boolean } | null;
}

interface AttendanceSummary {
  userId: string;
  employeeName: string;
  email: string;
  department: string;
  todayStatus: 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE' | null;
  inTime: string | null;
  outTime: string | null;
  insideGeofence: boolean | null;
  distance: number | null;
}

export default function GlobalPanel() {
  const { departments } = useDepartments();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });
  const [includeHeadsInGlobalReports, setIncludeHeadsInGlobalReports] = useState(false);

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
        department_id,
        departments(name, is_paused)
      `);

    if (profilesData) {
      // Filter out department heads and global managers (they are not part of attendance statistics)
      const rolesToExclude = includeHeads ? ['global_manager'] : ['department_head', 'global_manager'];

      const { data: excludedRoles } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', rolesToExclude);

      const excludedUserIds = new Set(excludedRoles?.map((r) => r.user_id) || []);

      const typedProfiles = (profilesData || []) as ProfileWithDepartment[];

      const filteredEmployees = typedProfiles
        .filter((p) => !excludedUserIds.has(p.user_id))
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          full_name: p.full_name,
          email: p.email,
          department_id: p.department_id,
          department_name: p.departments?.name || 'Sin departamento',
          department_paused: p.departments?.is_paused ?? false,
        }));

      setEmployees(filteredEmployees);

      // Fetch today's attendance
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const summaries: AttendanceSummary[] = [];

      for (const emp of filteredEmployees) {
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
          department: emp.department_name,
          todayStatus: emp.department_paused ? 'NO_LABORABLE' : inMark ? 'PRESENTE' : null,
          inTime: inMark?.timestamp || null,
          outTime: outMark?.timestamp || null,
          insideGeofence: inMark?.inside_geofence ?? null,
          distance: inMark?.distance_to_center ?? null,
        });
      }

      setAttendance(summaries);
    }

    setLoading(false);
  };

  const handleExport = async () => {
    setExporting(true);

    try {
      const reportData: AttendanceReportRow[] = [];

      for (const emp of employees) {
        const { data: marks } = await supabase
          .from('attendance_marks')
          .select('*')
          .eq('user_id', emp.user_id)
          .gte('timestamp', `${dateRange.from}T00:00:00`)
          .lte('timestamp', `${dateRange.to}T23:59:59`)
          .order('timestamp', { ascending: true });

        // Group by date
        const byDate: Record<string, typeof marks> = {};
        marks?.forEach((m) => {
          const date = m.timestamp.split('T')[0];
          if (!byDate[date]) byDate[date] = [];
          byDate[date].push(m);
        });

        // Generate rows for each date
        const start = new Date(dateRange.from);
        const end = new Date(dateRange.to);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = format(d, 'yyyy-MM-dd');
          const dayMarks = byDate[dateStr] || [];
          const inMark = dayMarks.find((m) => m.mark_type === 'IN');
          const outMark = dayMarks.filter((m) => m.mark_type === 'OUT').pop();

          reportData.push({
            date: dateStr,
            employee_name: emp.full_name,
            employee_email: emp.email,
            department: emp.department_name,
            status: emp.department_paused ? 'NO_LABORABLE' : inMark ? 'PRESENTE' : 'AUSENTE',
            in_time: inMark ? formatTime(inMark.timestamp) : null,
            out_time: outMark ? formatTime(outMark.timestamp) : null,
            lateness_minutes: null,
            inside_geofence: inMark?.inside_geofence ?? null,
            distance_m: inMark?.distance_to_center ?? null,
          });
        }
      }

      exportToXLSX(reportData, `asistencia_global_${dateRange.from}_${dateRange.to}`);
      toast.success('Reporte global descargado correctamente');
    } catch (error) {
      toast.error('Error al generar el reporte');
    }

    setExporting(false);
  };

  const metrics = {
    total: employees.length,
    present: attendance.filter((a) => a.todayStatus === 'PRESENTE').length,
    absent: attendance.filter((a) => !a.todayStatus).length,
    compliance: employees.length > 0
      ? Math.round(
          (attendance.filter((a) => a.todayStatus === 'PRESENTE').length /
            employees.length) *
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
              Vista general de todos los empleados · Jefes incluidos: {includeHeadsInGlobalReports ? 'Sí' : 'No'}
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            title="Cumplimiento"
            value={`${metrics.compliance}%`}
            icon={TrendingUp}
            variant="default"
          />
        </div>

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
                    <TableHead>Entrada</TableHead>
                    <TableHead>Salida</TableHead>
                    <TableHead>Ubicación</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAttendance.map((row) => (
                    <TableRow key={row.userId}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{row.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{row.email}</p>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
