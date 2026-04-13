import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ManagedDepartment {
  id: string;
  name: string;
}

interface UseManagedDepartmentsResult {
  departments: ManagedDepartment[];
  loading: boolean;
}

export function useManagedDepartments(userId?: string | null, primaryDepartmentId?: string | null): UseManagedDepartmentsResult {
  const [departments, setDepartments] = useState<ManagedDepartment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchManagedDepartments = useCallback(async () => {
    if (!userId) {
      setDepartments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const collected = new Map<string, ManagedDepartment>();

    try {
      if (primaryDepartmentId) {
        const { data: primaryDepartment } = await supabase
          .from('departments')
          .select('id, name')
          .eq('id', primaryDepartmentId)
          .maybeSingle();

        if (primaryDepartment?.id) {
          collected.set(primaryDepartment.id, {
            id: primaryDepartment.id,
            name: primaryDepartment.name,
          });
        }
      }

      const { data: responsibilityRows, error } = await supabase
        .from('user_department_responsibilities')
        .select('department_id')
        .eq('user_id', userId);

      if (error) throw error;

      const additionalDepartmentIds = Array.from(
        new Set((responsibilityRows || []).map((row) => row.department_id).filter(Boolean))
      );

      if (additionalDepartmentIds.length > 0) {
        const { data: additionalDepartments, error: additionalDepartmentsError } = await supabase
          .from('departments')
          .select('id, name')
          .in('id', additionalDepartmentIds);

        if (additionalDepartmentsError) throw additionalDepartmentsError;

        (additionalDepartments || []).forEach((department) => {
          collected.set(department.id, {
            id: department.id,
            name: department.name,
          });
        });
      }

      const orderedDepartments = Array.from(collected.values()).sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(orderedDepartments);
    } catch {
      setDepartments(Array.from(collected.values()));
    } finally {
      setLoading(false);
    }
  }, [primaryDepartmentId, userId]);

  useEffect(() => {
    void fetchManagedDepartments();
  }, [fetchManagedDepartments]);

  return { departments, loading };
}
