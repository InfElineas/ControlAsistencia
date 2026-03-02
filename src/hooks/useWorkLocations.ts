import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WorkLocation {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  accuracy_threshold: number;
  block_on_poor_accuracy: boolean;
  is_active: boolean;
}

function getStorageKey(userId?: string) {
  return userId ? `active-work-location:${userId}` : 'active-work-location:anonymous';
}

export function useWorkLocations() {
  const { user } = useAuth();
  const [locations, setLocations] = useState<WorkLocation[]>([]);
  const [loading, setLoading] = useState(true);

  const activeLocationId = useMemo(() => localStorage.getItem(getStorageKey(user?.id)) || null, [user?.id]);

  const fetchLocations = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('work_locations')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    setLocations((data || []) as WorkLocation[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLocations();
  }, [fetchLocations]);

  const setActiveLocation = useCallback(
    (locationId: string) => {
      localStorage.setItem(getStorageKey(user?.id), locationId);
    },
    [user?.id]
  );

  const clearActiveLocation = useCallback(() => {
    localStorage.removeItem(getStorageKey(user?.id));
  }, [user?.id]);

  return {
    locations,
    loading,
    activeLocationId,
    setActiveLocation,
    clearActiveLocation,
    refetch: fetchLocations,
  };
}
