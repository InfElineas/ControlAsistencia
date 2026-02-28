import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useGlobalManagerCheck() {
  const { user } = useAuth();
  const [isGlobalManager, setIsGlobalManager] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        setIsGlobalManager(false);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['global_manager', 'superadmin']);

        if (error) throw error;
        setIsGlobalManager((data ?? []).length > 0);
      } catch (err) {
        console.error('Error checking global manager status:', err);
        setIsGlobalManager(false);
      } finally {
        setLoading(false);
      }
    };

    checkRole();
  }, [user]);

  return { isGlobalManager, loading };
}
