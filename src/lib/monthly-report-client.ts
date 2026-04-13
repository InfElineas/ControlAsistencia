interface GenerateMonthlyReportPayload {
  from: string;
  to: string;
  scope: 'global' | 'department';
  department_id: string | null;
  include_heads: boolean;
  format: 'csv';
}

interface GenerateMonthlyReportResponse {
  success?: boolean;
  run_id?: string;
  row_count?: number;
  artifact_path?: string;
  checksum?: string;
  error?: string;
}

export async function generateMonthlyReport(
  accessToken: string,
  payload: GenerateMonthlyReportPayload
): Promise<GenerateMonthlyReportResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-monthly-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${accessToken}`,
      'x-client-auth': `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const body = (await response.json().catch(() => ({}))) as GenerateMonthlyReportResponse;

  if (!response.ok) {
    throw new Error(body?.error || 'Error al generar el reporte mensual asíncrono');
  }

  return body;
}
