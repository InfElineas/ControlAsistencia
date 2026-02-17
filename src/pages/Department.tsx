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
import { exportToXLSX, AttendanceReportRow, formatTime } from '@/lib/xlsx-export';
import { toast } from 'sonner';

interface DepartmentEmployee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
}

interface AttendanceSummary {
  userId: string;
  employeeName: string;
  email: string;
  todayStatus: 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE' | null;
  inTime: string | null;
  outTime: string | null;
  insideGeofence: boolean | null;
  distance: number | null;
}

export default function Department() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<DepartmentEmployee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSummary[]>([]);
  const [departmentName, setDepartmentName] = useState('');
  const [departmentPaused, setDepartmentPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState({
    from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    to: format(new Date(), 'yyyy-MM-dd'),
  });

  const fetchData = useCallback(async () => {
    if (!profile?.department_id) return;
    setLoading(true);

    let currentDepartmentPaused = false;

    // Fetch department name
    const { data: deptData } = await supabase
      .from('departments')
      .select('name, is_paused')
      .eq('id', profile.department_id)
      .single();

    if (deptData) {
      setDepartmentName(deptData.name);
      currentDepartmentPaused = Boolean(deptData.is_paused);
      setDepartmentPaused(currentDepartmentPaused);
    }

    // Fetch employees in department (excluding department heads and global managers)
    const { data: empData } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email')
      .eq('department_id', profile.department_id);

    // Filter out department heads and global managers from attendance statistics
    const { data: excludedRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .in('role', ['department_head', 'global_manager']);

    const excludedUserIds = new Set(excludedRoles?.map((r) => r.user_id) || []);
    const filteredEmpData = empData?.filter((p) => !excludedUserIds.has(p.user_id)) || [];

    if (filteredEmpData.length > 0 || empData) {
      setEmployees(filteredEmpData);

      // Fetch today's attendance for each employee
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const summaries: AttendanceSummary[] = [];

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
          todayStatus: currentDepartmentPaused ? 'NO_LABORABLE' : inMark ? 'PRESENTE' : null,
          inTime: inMark?.timestamp || null,
          outTime: outMark?.timestamp || null,
          insideGeofence: inMark?.inside_geofence ?? null,
          distance: inMark?.distance_to_center ?? null,
        });
      }

      setAttendance(summaries);
    }

    setLoading(false);
  }, [profile?.department_id]);

  useEffect(() => {
    if (profile?.department_id) {
      fetchData();
    }
  }, [profile?.department_id, fetchData]);

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
            department: departmentName,
            status: departmentPaused ? 'NO_LABORABLE' : inMark ? 'PRESENTE' : 'AUSENTE',
            in_time: inMark ? formatTime(inMark.timestamp) : null,
            out_time: outMark ? formatTime(outMark.timestamp) : null,
            lateness_minutes: null, // Could calculate based on config
            inside_geofence: inMark?.inside_geofence ?? null,
            distance_m: inMark?.distance_to_center ?? null,
          });
        }
      }

      exportToXLSX(
        reportData,
        `asistencia_${departmentName.replace(/\s+/g, '_')}_${dateRange.from}_${dateRange.to}`
      );
      toast.success('Reporte descargado correctamente');
    } catch (error) {
      toast.error('Error al generar el reporte');
    }

    setExporting(false);
  };

  const metrics = {
    total: employees.length,
    present: attendance.filter((a) => a.todayStatus === 'PRESENTE').length,
    absent: attendance.filter((a) => !a.todayStatus).length,
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
