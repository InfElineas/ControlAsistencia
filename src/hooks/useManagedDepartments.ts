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
        .select('department_id, departments(id, name)')
        .eq('user_id', userId);

      if (error) throw error;

      (responsibilityRows || []).forEach((row) => {
        const department = Array.isArray(row.departments) ? row.departments[0] : row.departments;
        if (!department?.id) return;

        collected.set(department.id, {
          id: department.id,
          name: department.name,
        });
      });

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
