import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/errors';

interface AttendanceMark {
  id: string;
  user_id: string;
  mark_type: 'IN' | 'OUT';
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  distance_to_center: number | null;
  inside_geofence: boolean;
  blocked: boolean;
  block_reason: string | null;
}

interface AttendanceState {
  todayMarks: AttendanceMark[];
  lastMark: AttendanceMark | null;
  canMarkIn: boolean;
  canMarkOut: boolean;
  loading: boolean;
  error: string | null;
}

interface MarkAttendanceResult {
  error: string | null;
  code?: string;
}

interface FunctionErrorPayload {
  error?: string;
  code?: string;
  allowed?: boolean;
}


function hasFunctionContext(error: unknown): error is { context: Response } {
  return typeof error === 'object' && error !== null && 'context' in error;
}

async function parseFunctionError(error: unknown): Promise<MarkAttendanceResult | null> {
  if (!hasFunctionContext(error)) {
    return null;
  }

  try {
    const payload = (await error.context.clone().json()) as FunctionErrorPayload;
    if (payload?.error) {
      return { error: payload.error, code: payload.code || 'FUNCTION_ERROR' };
    }
    return null;
  } catch {
    return null;
  }
}

export function useAttendance() {
  const { user } = useAuth();
  const [state, setState] = useState<AttendanceState>({
    todayMarks: [],
    lastMark: null,
    canMarkIn: true,
    canMarkOut: false,
    loading: true,
    error: null,
  });

  const fetchTodayMarks = useCallback(async () => {
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const { data, error } = await supabase
        .from('attendance_marks')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', today.toISOString())
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const marks = (data || []) as AttendanceMark[];
      const lastMark = marks[0] || null;
      
      // Determine what actions are available
      const canMarkIn = !lastMark || lastMark.mark_type === 'OUT';
      const canMarkOut = lastMark?.mark_type === 'IN';

      setState({
        todayMarks: marks,
        lastMark,
        canMarkIn,
        canMarkOut,
        loading: false,
        error: null,
      });
    } catch (error: unknown) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: getErrorMessage(error),
      }));
    }
    }, [user]);

  useEffect(() => {
    if (user) {
      fetchTodayMarks();
    }
  }, [user, fetchTodayMarks]);

  const markAttendance = async (
    markType: 'IN' | 'OUT',
    geoData: {
      latitude: number | null;
      longitude: number | null;
      accuracy: number | null;
      distanceToCenter: number | null;
      insideGeofence: boolean;
    }
  ): Promise<MarkAttendanceResult> => {
    if (!user) {
      return { error: 'Usuario no autenticado', code: 'UNAUTHORIZED' };
    }

    try {
      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { error: 'Sesión no válida', code: 'UNAUTHORIZED' };
      }

      // Call the edge function for validated attendance
      const response = await supabase.functions.invoke('validate-attendance', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          mark_type: markType,
          latitude: geoData.latitude,
          longitude: geoData.longitude,
          accuracy: geoData.accuracy,
          distance_to_center: geoData.distanceToCenter,
          inside_geofence: geoData.insideGeofence,
        },
      });

      if (response.error) {
        console.error('Edge function error:', response.error);
        const parsedFunctionError = await parseFunctionError(response.error);
        if (parsedFunctionError) {
          return parsedFunctionError;
        }
        return { error: 'Error al conectar con el servidor', code: 'CONNECTION_ERROR' };
      }

      const result = response.data;

      if (!result.success && !result.allowed) {
        return { error: result.error, code: result.code };
      }

      await fetchTodayMarks();
      return { error: null };
    } catch (error: unknown) {
      console.error('Attendance error:', error);
      return { error: getErrorMessage(error, 'Error desconocido'), code: 'UNKNOWN_ERROR' };
    }
  };

  return {
    ...state,
    markAttendance,
    refreshMarks: fetchTodayMarks,
  };
}
