import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';

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

interface DepartmentWithSchedule {
  id: string;
  name: string;
  is_paused: boolean;
  schedule: DepartmentSchedule | null;
}

export function useDepartmentSchedules() {
  const [departmentsWithSchedules, setDepartmentsWithSchedules] = useState<DepartmentWithSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      
      // Fetch all departments
      const { data: departments, error: deptError } = await supabase
        .from('departments')
        .select('*')
        .order('name');

      if (deptError) throw deptError;

      // Fetch all schedules
      const { data: schedules, error: schedError } = await supabase
        .from('department_schedules')
        .select('*');

      if (schedError) throw schedError;

      // Combine data
      const combined = (departments || []).map((dept) => ({
        id: dept.id,
        name: dept.name,
        is_paused: dept.is_paused ?? false,
        schedule: schedules?.find((s) => s.department_id === dept.id) || null,
      }));

      setDepartmentsWithSchedules(combined);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const updateSchedule = async (
    departmentId: string,
    scheduleData: {
      checkin_start_time: string;
      checkin_end_time: string;
      checkout_start_time?: string | null;
      checkout_end_time?: string | null;
      timezone?: string;
      allow_early_checkin?: boolean;
      allow_late_checkout?: boolean;
    }
  ) => {
    try {
      // Check if schedule exists
      const existing = departmentsWithSchedules.find((d) => d.id === departmentId)?.schedule;

      if (existing) {
        // Update
        const { error } = await supabase
          .from('department_schedules')
          .update({
            ...scheduleData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert
        const { error } = await supabase
          .from('department_schedules')
          .insert({
            department_id: departmentId,
            ...scheduleData,
          });

        if (error) throw error;
      }

      await fetchSchedules();
      return { error: null };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  };

  const updateDepartmentPause = async (departmentId: string, isPaused: boolean) => {
    try {
      const { error } = await supabase
        .from('departments')
        .update({
          is_paused: isPaused,
          updated_at: new Date().toISOString(),
        })
        .eq('id', departmentId);

      if (error) throw error;

      await fetchSchedules();
      return { error: null };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  };

  return {
    departmentsWithSchedules,
    loading,
    error,
    updateSchedule,
    updateDepartmentPause,
    refetch: fetchSchedules,
  };
}
