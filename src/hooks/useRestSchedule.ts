import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';

interface RestSchedule {
  id: string;
  user_id: string;
  days_of_week: number[];
  effective_from: string;
  notes: string | null;
  created_at: string;
}

export function useRestSchedule(targetUserId?: string | null) {
  const { user } = useAuth();
  const effectiveUserId = targetUserId ?? user?.id ?? null;
  const [schedules, setSchedules] = useState<RestSchedule[]>([]);
  const [currentSchedule, setCurrentSchedule] = useState<RestSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!effectiveUserId) return;

    try {
      const { data, error } = await supabase
        .from('user_rest_schedule')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('effective_from', { ascending: false });

      if (error) throw error;
      
      setSchedules(data || []);
      
      // Find current effective schedule
      const today = new Date().toISOString().split('T')[0];
      const current = (data || []).find(s => s.effective_from <= today);
      setCurrentSchedule(current || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  useEffect(() => {
    if (effectiveUserId) {
      fetchSchedules();
    }
  }, [effectiveUserId, fetchSchedules]);

  // Validate that rest days have at least 3 days of separation
  const validateRestDaysSeparation = (daysOfWeek: number[]): { valid: boolean; error?: string } => {
    if (daysOfWeek.length < 2) return { valid: true };
    
    // Sort days
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);
    
    for (let i = 0; i < sortedDays.length; i++) {
      for (let j = i + 1; j < sortedDays.length; j++) {
        const day1 = sortedDays[i];
        const day2 = sortedDays[j];
        
        // Calculate circular distance (accounting for week wrap)
        const directDistance = Math.abs(day2 - day1);
        const wrapDistance = 7 - directDistance;
        const minDistance = Math.min(directDistance, wrapDistance);
        
        if (minDistance < 3) {
          return { 
            valid: false, 
            error: 'Los días de descanso deben tener al menos 3 días de separación entre ellos' 
          };
        }
      }
    }
    
    return { valid: true };
  };

  const addSchedule = async (daysOfWeek: number[], effectiveFrom: string, notes?: string) => {
    if (!effectiveUserId) return { error: 'Usuario no autenticado' };

    // Validate separation between rest days
    const validation = validateRestDaysSeparation(daysOfWeek);
    if (!validation.valid) {
      return { error: validation.error };
    }

    try {
      const { error } = await supabase
        .from('user_rest_schedule')
        .insert({
          user_id: effectiveUserId,
          days_of_week: daysOfWeek,
          effective_from: effectiveFrom,
          notes,
        });

      if (error) throw error;
      await fetchSchedules();
      return { error: null };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  };

  const isRestDay = (date: Date): boolean => {
    if (!currentSchedule) return false;
    const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
    return currentSchedule.days_of_week.includes(dayOfWeek);
  };

  return {
    schedules,
    currentSchedule,
    loading,
    error,
    addSchedule,
    isRestDay,
    validateRestDaysSeparation,
    refetch: fetchSchedules,
  };
}
