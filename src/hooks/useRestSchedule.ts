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

interface RestGroup {
  id: string;
  department_id: string;
  name: string;
  days_of_week: number[];
}

interface GroupModeInfo {
  enabled: boolean;
  departmentName: string | null;
}

export function useRestSchedule(targetUserId?: string | null) {
  const { user, role } = useAuth();
  const effectiveUserId = targetUserId ?? user?.id ?? null;
  const isOwnSchedule = !targetUserId || targetUserId === user?.id;
  const canUsePersonalSchedule = role === 'department_head' && isOwnSchedule;
  const [schedules, setSchedules] = useState<RestSchedule[]>([]);
  const [currentSchedule, setCurrentSchedule] = useState<RestSchedule | null>(null);
  const [restGroups, setRestGroups] = useState<RestGroup[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupModeInfo>({ enabled: false, departmentName: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!effectiveUserId) return;

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('department_id')
        .eq('user_id', effectiveUserId)
        .single();

      if (profileError) throw profileError;

      const departmentId = profileData.department_id;
      const { data: departmentData, error: departmentError } = await supabase
        .from('departments')
        .select('name, rest_groups_enabled')
        .eq('id', departmentId)
        .single();

      if (departmentError) throw departmentError;

      const isGroupModeEnabled = Boolean(departmentData.rest_groups_enabled);

      const now = new Date();
      const currentDay = now.getDay();
      const mondayDistance = currentDay === 0 ? 6 : currentDay - 1;
      const weekStartDate = new Date(now);
      weekStartDate.setDate(now.getDate() - mondayDistance);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);

      const weekStart = weekStartDate.toISOString().slice(0, 10);
      const weekEnd = weekEndDate.toISOString().slice(0, 10);

      setGroupMode({
        enabled: isGroupModeEnabled && !canUsePersonalSchedule,
        departmentName: departmentData.name,
      });

      if (isGroupModeEnabled && !canUsePersonalSchedule) {
        const { data: groupsData, error: groupsError } = await supabase
          .from('rest_groups')
          .select('id, department_id, name, days_of_week')
          .eq('department_id', departmentId)
          .order('name', { ascending: true });

        if (groupsError) throw groupsError;

        const groups = (groupsData || []) as RestGroup[];
        setRestGroups(groups);

        const { data: membersData, error: membersError } = await supabase
          .from('rest_group_members')
          .select('group_id, effective_from')
          .eq('user_id', effectiveUserId)
          .order('effective_from', { ascending: false });

        if (membersError) throw membersError;

        const currentMember =
          (membersData || []).find((member) => member.effective_from >= weekStart && member.effective_from <= weekEnd) || null;
        setCurrentGroupId(currentMember?.group_id ?? null);

        const currentGroup = groups.find((group) => group.id === currentMember?.group_id);
        if (currentGroup) {
          setCurrentSchedule({
            id: currentGroup.id,
            user_id: effectiveUserId,
            days_of_week: currentGroup.days_of_week,
            effective_from: currentMember?.effective_from ?? weekStart,
            notes: `Grupo: ${currentGroup.name}`,
            created_at: weekStart,
          });
        } else {
          setCurrentSchedule(null);
        }

        setSchedules([]);
        return;
      }

      const { data, error } = await supabase
        .from('user_rest_schedule')
        .select('*')
        .eq('user_id', effectiveUserId)
        .order('effective_from', { ascending: false });

      if (error) throw error;

      setSchedules(data || []);
      setRestGroups([]);
      setCurrentGroupId(null);

      const current =
        (data || []).find((schedule) => schedule.effective_from >= weekStart && schedule.effective_from <= weekEnd) || null;
      setCurrentSchedule(current || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canUsePersonalSchedule, effectiveUserId]);

  useEffect(() => {
    if (effectiveUserId) {
      fetchSchedules();
    }
  }, [effectiveUserId, fetchSchedules]);

  const validateRestDaysSeparation = (daysOfWeek: number[]): { valid: boolean; error?: string } => {
    if (daysOfWeek.length < 2) return { valid: true };

    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

    for (let i = 0; i < sortedDays.length; i++) {
      for (let j = i + 1; j < sortedDays.length; j++) {
        const day1 = sortedDays[i];
        const day2 = sortedDays[j];

        const directDistance = Math.abs(day2 - day1);
        const wrapDistance = 7 - directDistance;
        const minDistance = Math.min(directDistance, wrapDistance);

        if (minDistance < 3) {
          return {
            valid: false,
            error: 'Los días de descanso deben tener al menos 3 días de separación entre ellos',
          };
        }
      }
    }

    return { valid: true };
  };

  const hasWorkedOnSelectedRestDay = async (daysOfWeek: number[], effectiveFrom: string): Promise<{ valid: boolean; error?: string }> => {
    if (!effectiveUserId) return { valid: true };

    const start = new Date(`${effectiveFrom}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    const { data, error } = await supabase
      .from('attendance_marks')
      .select('timestamp')
      .eq('user_id', effectiveUserId)
      .gte('timestamp', start.toISOString())
      .lt('timestamp', end.toISOString());

    if (error) {
      return { valid: false, error: getErrorMessage(error) };
    }

    const conflictingMark = (data || []).find((mark) => {
      const markDate = new Date(mark.timestamp);
      return daysOfWeek.includes(markDate.getDay());
    });

    if (!conflictingMark) {
      return { valid: true };
    }

    const conflictDate = new Date(conflictingMark.timestamp).toLocaleDateString('es-ES');
    return {
      valid: false,
      error: `No puedes asignar descanso en un día ya trabajado (${conflictDate}).`,
    };
  };

  const addSchedule = async (daysOfWeek: number[], effectiveFrom: string, notes?: string) => {
    if (!effectiveUserId) return { error: 'Usuario no autenticado' };

    if (groupMode.enabled) {
      return { error: `El departamento ${groupMode.departmentName || ''} trabaja con grupos de descanso.` };
    }

    const validation = validateRestDaysSeparation(daysOfWeek);
    if (!validation.valid) {
      return { error: validation.error };
    }

    const workedDayValidation = await hasWorkedOnSelectedRestDay(daysOfWeek, effectiveFrom);
    if (!workedDayValidation.valid) {
      return { error: workedDayValidation.error };
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

  const assignGroup = async (groupId: string, effectiveFrom: string, notes?: string) => {
    if (!effectiveUserId) return { error: 'Usuario no autenticado' };

    if (!groupMode.enabled) {
      return { error: 'Este departamento no tiene grupos de descanso activos.' };
    }

    try {
      const selectedGroup = restGroups.find((group) => group.id === groupId);
      if (!selectedGroup) {
        return { error: 'Grupo de descanso no válido.' };
      }

      const workedDayValidation = await hasWorkedOnSelectedRestDay(selectedGroup.days_of_week, effectiveFrom);
      if (!workedDayValidation.valid) {
        return { error: workedDayValidation.error };
      }

      const { error } = await supabase
        .from('rest_group_members')
        .insert({
          group_id: groupId,
          user_id: effectiveUserId,
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
    const dayOfWeek = date.getDay();
    return currentSchedule.days_of_week.includes(dayOfWeek);
  };

  return {
    schedules,
    currentSchedule,
    loading,
    error,
    addSchedule,
    assignGroup,
    restGroups,
    currentGroupId,
    groupMode,
    canUsePersonalSchedule,
    isRestDay,
    validateRestDaysSeparation,
    refetch: fetchSchedules,
  };
}
