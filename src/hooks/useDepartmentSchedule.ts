import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';

interface DepartmentSchedule {
  id: string;
  department_id: string;
  checkin_start_time: string;
  checkin_end_time: string;
  checkout_start_time: string | null;
  checkout_end_time: string | null;
  timezone: string;
  allow_early_checkin: boolean;
  allow_late_checkout: boolean;
}

function parseTimeToSeconds(time: string): number {
  const [hours = '0', minutes = '0', seconds = '0'] = time.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function getCurrentTimeInTimezone(timezone: string): string {
  try {
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

    return `${hour}:${minute}:${second}`;
  } catch {
    const now = new Date();
    const hour = String(now.getUTCHours()).padStart(2, '0');
    const minute = String(now.getUTCMinutes()).padStart(2, '0');
    const second = String(now.getUTCSeconds()).padStart(2, '0');
    return `${hour}:${minute}:${second}`;
  }
}

export function useDepartmentSchedule() {
  const { profile } = useAuth();
  const [schedule, setSchedule] = useState<DepartmentSchedule | null>(null);
  const [globalTimezone, setGlobalTimezone] = useState<string>('UTC');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSchedule = async () => {
      if (!profile?.department_id) {
        setLoading(false);
        return;
      }

      try {
        const [{ data, error }, { data: timezoneConfig }] = await Promise.all([
          supabase
            .from('department_schedules')
            .select('*')
            .eq('department_id', profile.department_id)
            .single(),
          supabase
            .from('app_config')
            .select('value')
            .eq('key', 'global_timezone')
            .maybeSingle(),
        ]);

        if (error && error.code !== 'PGRST116') {
          throw error;
        }

        if (typeof timezoneConfig?.value === 'string') {
          setGlobalTimezone(timezoneConfig.value);
        }

        setSchedule(data);
      } catch (err: unknown) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchSchedule();
  }, [profile?.department_id]);

  const isWithinCheckinWindow = (): { allowed: boolean; message: string | null } => {
    if (!schedule) {
      return { allowed: false, message: 'Departamento sin horario configurado' };
    }

    const effectiveTimezone = globalTimezone || schedule.timezone;
    const currentTime = getCurrentTimeInTimezone(effectiveTimezone);
    const currentSeconds = parseTimeToSeconds(currentTime);
    const startSeconds = parseTimeToSeconds(schedule.checkin_start_time);
    const endSeconds = parseTimeToSeconds(schedule.checkin_end_time);

    if (currentSeconds < startSeconds && !schedule.allow_early_checkin) {
      return {
        allowed: false,
        message: `Entrada anticipada no permitida. Horario: ${schedule.checkin_start_time.slice(0, 5)} - ${schedule.checkin_end_time.slice(0, 5)} (${effectiveTimezone})`,
      };
    }

    if (currentSeconds > endSeconds) {
      return {
        allowed: false,
        message: `Hora de entrada excedida. Horario: ${schedule.checkin_start_time.slice(0, 5)} - ${schedule.checkin_end_time.slice(0, 5)} (${effectiveTimezone})`,
      };
    }

    return { allowed: true, message: null };
  };

  const getCurrentTimeLabel = (): string | null => {
    if (!schedule) return null;
    const effectiveTimezone = globalTimezone || schedule.timezone;
    const currentTime = getCurrentTimeInTimezone(effectiveTimezone);
    return `${currentTime.slice(0, 5)} (${effectiveTimezone})`;
  };

  const hasReachedCheckoutTime = (): boolean => {
    if (!schedule?.checkout_start_time) return false;

    const effectiveTimezone = globalTimezone || schedule.timezone;
    const currentTime = getCurrentTimeInTimezone(effectiveTimezone);
    const currentSeconds = parseTimeToSeconds(currentTime);
    const checkoutStartSeconds = parseTimeToSeconds(schedule.checkout_start_time);

    return currentSeconds >= checkoutStartSeconds;
  };

  return {
    schedule,
    loading,
    error,
    isWithinCheckinWindow,
    getCurrentTimeLabel,
    hasReachedCheckoutTime,
  };
}
