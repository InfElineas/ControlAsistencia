import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

interface ValidationRequest {
  mark_type: 'IN' | 'OUT';
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  distance_to_center?: number | null;
  inside_geofence?: boolean;
  work_location_id?: string | null;
}

interface ValidationResult {
  allowed: boolean;
  reason: string | null;
  department_id: string | null;
}

interface CheckinConfig {
  checkin_end_time: string | null;
  timezone: string;
}

interface WorkLocationConfig {
  id: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  accuracy_threshold: number;
  block_on_poor_accuracy: boolean;
  is_active: boolean;
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function parseTimeToSeconds(time: string): number {
  const [hours = '0', minutes = '0', seconds = '0'] = time.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function getCurrentSecondsInTimezone(timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  const second = parts.find((part) => part.type === 'second')?.value ?? '00';

  return parseTimeToSeconds(`${hour}:${minute}:${second}`);
}

async function isLateCheckin(
  supabaseAdmin: ReturnType<typeof createClient>,
  departmentId: string | null
): Promise<boolean> {
  if (!departmentId) return false;

  const [{ data: scheduleData, error: scheduleError }, { data: timezoneConfig }] = await Promise.all([
    supabaseAdmin
      .from('department_schedules')
      .select('checkin_end_time, timezone')
      .eq('department_id', departmentId)
      .single<CheckinConfig>(),
    supabaseAdmin
      .from('app_config')
      .select('value')
      .eq('key', 'global_timezone')
      .maybeSingle(),
  ]);

  if (scheduleError || !scheduleData?.checkin_end_time) {
    return false;
  }

  const globalTimezone = typeof timezoneConfig?.value === 'string'
    ? timezoneConfig.value
    : null;

  const timezone = globalTimezone || scheduleData.timezone || 'UTC';
  const checkinEndSeconds = parseTimeToSeconds(scheduleData.checkin_end_time);
  const currentSeconds = getCurrentSecondsInTimezone(timezone);

  return currentSeconds > checkinEndSeconds;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'No autorizado', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'No autorizado', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ValidationRequest = await req.json();
    const { mark_type, latitude, longitude, accuracy, distance_to_center, inside_geofence, work_location_id } = body;

    if (!mark_type || !['IN', 'OUT'].includes(mark_type)) {
      return new Response(
        JSON.stringify({ error: 'Tipo de marcaje inválido', code: 'INVALID_MARK_TYPE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data: activeVacation } = await supabaseAdmin
      .from('vacation_requests')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'approved')
      .lte('start_date', today)
      .gte('end_date', today)
      .maybeSingle();

    if (activeVacation) {
      return new Response(
        JSON.stringify({
          error: 'No puedes marcar asistencia durante vacaciones aprobadas',
          code: 'ON_VACATION',
          allowed: false,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: validationResult, error: validationError } = await supabaseAdmin
      .rpc('validate_attendance_mark', {
        _user_id: user.id,
        _mark_type: mark_type,
      });

    if (validationError) {
      console.error('Validation error:', validationError);
      return new Response(
        JSON.stringify({ error: 'Error al validar asistencia', code: 'VALIDATION_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = validationResult?.[0] as ValidationResult | undefined;

    if (!result) {
      return new Response(
        JSON.stringify({ error: 'Error en la validación', code: 'VALIDATION_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!result.allowed) {
      return new Response(
        JSON.stringify({
          error: result.reason || 'No autorizado para registrar asistencia',
          code: 'FORBIDDEN',
          allowed: false,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!work_location_id) {
      return new Response(
        JSON.stringify({
          error: 'Selecciona una ubicación de trabajo antes de marcar asistencia',
          code: 'MISSING_WORK_LOCATION',
          allowed: false,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: workLocation, error: locationError } = await supabaseAdmin
      .from('work_locations')
      .select('id, center_lat, center_lng, radius_meters, accuracy_threshold, block_on_poor_accuracy, is_active')
      .eq('id', work_location_id)
      .maybeSingle<WorkLocationConfig>();

    if (locationError || !workLocation || !workLocation.is_active) {
      return new Response(
        JSON.stringify({
          error: 'La ubicación seleccionada no está disponible',
          code: 'INVALID_WORK_LOCATION',
          allowed: false,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const hasCoordinates = typeof latitude === 'number' && typeof longitude === 'number';
    const computedDistance = hasCoordinates
      ? calculateDistanceMeters(latitude, longitude, workLocation.center_lat, workLocation.center_lng)
      : null;

    const computedInsideGeofence = computedDistance !== null
      ? computedDistance <= workLocation.radius_meters
      : false;

    if (mark_type === 'IN' && !computedInsideGeofence) {
      return new Response(
        JSON.stringify({
          error: 'Debes estar dentro de la zona permitida para marcar entrada',
          code: 'OUTSIDE_GEOFENCE',
          allowed: false,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (
      workLocation.block_on_poor_accuracy &&
      typeof accuracy === 'number' &&
      accuracy > workLocation.accuracy_threshold
    ) {
      return new Response(
        JSON.stringify({
          error: 'La precisión GPS es insuficiente para registrar asistencia',
          code: 'LOW_GPS_ACCURACY',
          allowed: false,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lateCheckin = mark_type === 'IN'
      ? await isLateCheckin(supabaseAdmin, result.department_id)
      : false;

    const { data: markData, error: insertError } = await supabaseAdmin
      .from('attendance_marks')
      .insert({
        user_id: user.id,
        mark_type,
        latitude,
        longitude,
        accuracy,
        distance_to_center: computedDistance ?? distance_to_center ?? null,
        inside_geofence: computedInsideGeofence,
        work_location_id,
        blocked: false,
        block_reason: lateCheckin ? 'LATE_CHECKIN' : null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(
        JSON.stringify({ error: 'Error al registrar asistencia', code: 'INSERT_ERROR' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        allowed: true,
        mark: markData,
        message: mark_type === 'IN'
          ? lateCheckin ? 'Entrada registrada con tardanza' : 'Entrada registrada correctamente'
          : 'Salida registrada correctamente',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
