import * as XLSX from 'xlsx';

export interface AttendanceReportRow {
  date: string;
  user_id?: string;
  employee_name: string;
  employee_email: string;
  department: string;
  status: 'PRESENTE' | 'TARDE' | 'AUSENTE' | 'DESCANSO' | 'NO_LABORABLE';
  in_time: string | null;
  out_time: string | null;
  lateness_minutes: number | null;
  inside_geofence: boolean | null;
  distance_m: number | null;
  absence_justification?: 'JUSTIFICADA' | 'NO_JUSTIFICADA' | 'PENDIENTE' | '-';
  vacation_status?: 'VACACIONES' | '-';
}

type AttendanceStatus = AttendanceReportRow['status'];

const STATUS_CODES: Record<AttendanceStatus, string> = {
  PRESENTE: 'P',
  TARDE: 'T',
  AUSENTE: 'A',
  DESCANSO: 'D',
  NO_LABORABLE: 'NL',
};

const SUMMARY_COLUMNS: AttendanceStatus[] = ['PRESENTE', 'TARDE', 'AUSENTE', 'DESCANSO', 'NO_LABORABLE'];
const SUMMARY_HEADERS = [
  'Presente',
  'Tarde',
  'Ausente',
  'Descanso',
  'No laborable',
  'Vacaciones',
  'Aus. justificada',
  'Aus. no justificada',
];

function formatMinutesAsHours(value: number | null): string {
  if (value === null || value <= 0) return '-';
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor(value % 60)
    .toString()
    .padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function exportToXLSX(data: AttendanceReportRow[], filename: string) {
  // Create workbook and worksheet
  const wb = XLSX.utils.book_new();
  
  // Convert data to worksheet format with headers in Spanish
  const wsData = [...data]
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.department !== b.department) return a.department.localeCompare(b.department);
      return a.employee_name.localeCompare(b.employee_name);
    })
    .map(row => ({
    'Fecha': row.date,
    'Empleado': row.employee_name,
    'Email': row.employee_email,
    'Departamento': row.department,
    'Estado': row.status,
    'Hora Entrada': row.in_time || '-',
    'Hora Salida': row.out_time || '-',
    'Tardanza (h:mm)': formatMinutesAsHours(row.lateness_minutes),
    'Ausencia Justificada': row.absence_justification ?? '-',
    'Vacaciones': row.vacation_status ?? '-',
    'Dentro Geofence': row.inside_geofence === null ? '-' : (row.inside_geofence ? 'Sí' : 'No'),
    'Distancia (m)': row.distance_m ?? '-',
  }));

  const ws = XLSX.utils.json_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = [
    { wch: 12 },  // Fecha
    { wch: 25 },  // Empleado
    { wch: 30 },  // Email
    { wch: 18 },  // Departamento
    { wch: 15 },  // Estado
    { wch: 12 },  // Hora Entrada
    { wch: 12 },  // Hora Salida
    { wch: 16 },  // Tardanza (h:mm)
    { wch: 22 },  // Ausencia Justificada
    { wch: 12 },  // Vacaciones
    { wch: 15 },  // Dentro Geofence
    { wch: 12 },  // Distancia
  ];

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');

  // Generate file and download
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

function getMonthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function buildMonthDays(monthKey: string): string[] {
  const [yearText, monthText] = monthKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const totalDays = new Date(year, month, 0).getDate();
  return Array.from({ length: totalDays }, (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`);
}

function listMonthKeys(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor <= last) {
    keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return keys;
}

function formatMonthLabel(monthKey: string): string {
  const [yearText, monthText] = monthKey.split('-');
  const date = new Date(Number(yearText), Number(monthText) - 1, 1);
  const month = date.toLocaleDateString('es-ES', { month: 'long' });
  return `${month[0].toUpperCase()}${month.slice(1)} ${yearText}`;
}

export function exportAttendanceMatrixXLSX(
  data: AttendanceReportRow[],
  filename: string,
  options: { from: string; to: string }
) {
  const wb = XLSX.utils.book_new();
  const monthKeys = listMonthKeys(options.from, options.to);
  const detailMonthKey = monthKeys[monthKeys.length - 1] ?? getMonthKey(options.to);
  const detailMonthDays = buildMonthDays(detailMonthKey);

  type EmployeeAggregate = {
    department: string;
    name: string;
    email: string;
    monthlySummary: Record<string, Record<AttendanceStatus, number> & {
      vacations: number;
      justified_absences: number;
      unjustified_absences: number;
    }>;
    dailyStatus: Record<string, AttendanceStatus>;
    dailyMeta: Record<string, { vacation: boolean; absenceJustification: AttendanceReportRow['absence_justification'] }>;
  };

  const employeeMap = new Map<string, EmployeeAggregate>();

  for (const row of data) {
    const key = `${row.department}||${row.employee_email}`;
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        department: row.department,
        name: row.employee_name,
        email: row.employee_email,
        monthlySummary: {},
        dailyStatus: {},
        dailyMeta: {},
      });
    }

    const aggregate = employeeMap.get(key)!;
    const monthKey = getMonthKey(row.date);
    if (!aggregate.monthlySummary[monthKey]) {
      aggregate.monthlySummary[monthKey] = {
        PRESENTE: 0,
        TARDE: 0,
        AUSENTE: 0,
        DESCANSO: 0,
        NO_LABORABLE: 0,
        vacations: 0,
        justified_absences: 0,
        unjustified_absences: 0,
      };
    }

    aggregate.monthlySummary[monthKey][row.status] += 1;
    if (row.vacation_status === 'VACACIONES') {
      aggregate.monthlySummary[monthKey].vacations += 1;
    }
    if (row.status === 'AUSENTE' && row.absence_justification === 'JUSTIFICADA') {
      aggregate.monthlySummary[monthKey].justified_absences += 1;
    }
    if (row.status === 'AUSENTE' && row.absence_justification === 'NO_JUSTIFICADA') {
      aggregate.monthlySummary[monthKey].unjustified_absences += 1;
    }
    aggregate.dailyStatus[row.date] = row.status;
    aggregate.dailyMeta[row.date] = {
      vacation: row.vacation_status === 'VACACIONES',
      absenceJustification: row.absence_justification,
    };
  }

  const headerRow1: Array<string | number> = ['Área', 'Nombres y apellidos'];
  const headerRow2: Array<string | number> = ['', ''];
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
    { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
  ];

  let cursorCol = 2;
  for (const monthKey of monthKeys) {
    headerRow1.push(`Resumen ${formatMonthLabel(monthKey)}`);
    headerRow2.push(...SUMMARY_HEADERS);
    merges.push({ s: { r: 0, c: cursorCol }, e: { r: 0, c: cursorCol + SUMMARY_HEADERS.length - 1 } });
    cursorCol += SUMMARY_HEADERS.length;
  }

  headerRow1.push(`Detalle ${formatMonthLabel(detailMonthKey)}`);
  for (const day of detailMonthDays) {
    headerRow2.push(Number(day.slice(-2)));
  }
  merges.push({ s: { r: 0, c: cursorCol }, e: { r: 0, c: cursorCol + detailMonthDays.length - 1 } });
  cursorCol += detailMonthDays.length;

  headerRow1.push(`Resumen ${formatMonthLabel(detailMonthKey)}`);
  headerRow2.push(...SUMMARY_HEADERS);
  merges.push({ s: { r: 0, c: cursorCol }, e: { r: 0, c: cursorCol + SUMMARY_HEADERS.length - 1 } });

  const rows: Array<Array<string | number>> = [headerRow1, headerRow2];
  const employees = Array.from(employeeMap.values()).sort((a, b) =>
    a.department.localeCompare(b.department) || a.name.localeCompare(b.name)
  );

  for (const employee of employees) {
    const row: Array<string | number> = [employee.department, employee.name];

    for (const monthKey of monthKeys) {
      const monthSummary = employee.monthlySummary[monthKey] || {
        PRESENTE: 0,
        TARDE: 0,
        AUSENTE: 0,
        DESCANSO: 0,
        NO_LABORABLE: 0,
        vacations: 0,
        justified_absences: 0,
        unjustified_absences: 0,
      };
      for (const status of SUMMARY_COLUMNS) {
        row.push(monthSummary[status]);
      }
      row.push(monthSummary.vacations, monthSummary.justified_absences, monthSummary.unjustified_absences);
    }

    for (const day of detailMonthDays) {
      const status = employee.dailyStatus[day];
      const meta = employee.dailyMeta[day];
      if (!status) {
        row.push('');
      } else if (status === 'AUSENTE') {
        const justification = meta?.absenceJustification;
        if (justification === 'JUSTIFICADA') row.push('AJ');
        else if (justification === 'NO_JUSTIFICADA') row.push('ANJ');
        else row.push('AP');
      } else if (meta?.vacation) {
        row.push('V');
      } else {
        row.push(STATUS_CODES[status]);
      }
    }

    const detailSummary = employee.monthlySummary[detailMonthKey] || {
      PRESENTE: 0,
      TARDE: 0,
      AUSENTE: 0,
      DESCANSO: 0,
      NO_LABORABLE: 0,
      vacations: 0,
      justified_absences: 0,
      unjustified_absences: 0,
    };
    for (const status of SUMMARY_COLUMNS) {
      row.push(detailSummary[status]);
    }
    row.push(detailSummary.vacations, detailSummary.justified_absences, detailSummary.unjustified_absences);

    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 18 },
    { wch: 34 },
    ...Array.from({ length: monthKeys.length * SUMMARY_HEADERS.length }, () => ({ wch: 10 })),
    ...Array.from({ length: detailMonthDays.length }, () => ({ wch: 4 })),
    ...Array.from({ length: SUMMARY_HEADERS.length }, () => ({ wch: 12 })),
  ];

  ws['!autofilter'] = {
    ref: `A2:${XLSX.utils.encode_col(rows[0].length - 1)}2`,
  };

  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
