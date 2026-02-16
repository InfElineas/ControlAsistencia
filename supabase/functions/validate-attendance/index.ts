import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ValidationRequest {
  mark_type: 'IN' | 'OUT';
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  distance_to_center?: number | null;
  inside_geofence?: boolean;
}

interface ValidationResult {
  allowed: boolean;
  reason: string | null;
  department_id: string | null;
}

interface CheckoutConfig {
  checkout_start_time: string | null;
  timezone: string;
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

async function hasReachedCheckoutTime(
  supabaseAdmin: ReturnType<typeof createClient>,
  departmentId: string | null
): Promise<boolean> {
  if (!departmentId) return false;

  const { data, error } = await supabaseAdmin
    .from('department_schedules')
    .select('checkout_start_time, timezone')
    .eq('department_id', departmentId)
    .single<CheckoutConfig>();

  if (error || !data?.checkout_start_time) {
    return false;
  }

  const checkoutSeconds = parseTimeToSeconds(data.checkout_start_time);
  const currentSeconds = getCurrentSecondsInTimezone(data.timezone || 'UTC');

  return currentSeconds >= checkoutSeconds;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No autorizado', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'No autorizado', code: 'UNAUTHORIZED' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ValidationRequest = await req.json();
    const { mark_type, latitude, longitude, accuracy, distance_to_center, inside_geofence } = body;

    if (!mark_type || !['IN', 'OUT'].includes(mark_type)) {
      return new Response(
        JSON.stringify({ error: 'Tipo de marcaje inválido', code: 'INVALID_MARK_TYPE' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

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
        _mark_type: mark_type
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
          allowed: false
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mark_type === 'IN' && inside_geofence === false) {
      return new Response(
        JSON.stringify({
          error: 'Debes estar dentro de la zona permitida para marcar entrada',
          code: 'OUTSIDE_GEOFENCE',
          allowed: false
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (mark_type === 'OUT' && inside_geofence !== false) {
      const reachedCheckout = await hasReachedCheckoutTime(supabaseAdmin, result.department_id);

      if (!reachedCheckout) {
        return new Response(
          JSON.stringify({
            error: 'La salida se habilita al salir de la zona o al llegar al horario de salida.',
            code: 'OUT_NOT_ALLOWED_YET',
            allowed: false
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const { data: markData, error: insertError } = await supabaseAdmin
      .from('attendance_marks')
      .insert({
        user_id: user.id,
        mark_type,
        latitude,
        longitude,
        accuracy,
        distance_to_center,
        inside_geofence: inside_geofence ?? true,
        blocked: false,
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
        message: mark_type === 'IN' ? 'Entrada registrada correctamente' : 'Salida registrada correctamente'
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
