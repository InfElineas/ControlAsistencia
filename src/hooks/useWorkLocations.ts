import { useCallback, useEffect, useState } from 'react';
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
  const [activeLocationId, setActiveLocationId] = useState<string | null>(null);

  useEffect(() => {
    const key = getStorageKey(user?.id);
    setActiveLocationId(localStorage.getItem(key));

    const handleStorageSync = () => {
      setActiveLocationId(localStorage.getItem(key));
    };

    window.addEventListener('storage', handleStorageSync);
    window.addEventListener('work-location-changed', handleStorageSync);

    return () => {
      window.removeEventListener('storage', handleStorageSync);
      window.removeEventListener('work-location-changed', handleStorageSync);
    };
  }, [user?.id]);

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
      const key = getStorageKey(user?.id);
      localStorage.setItem(key, locationId);
      setActiveLocationId(locationId);
      window.dispatchEvent(new Event('work-location-changed'));
    },
    [user?.id]
  );

  const clearActiveLocation = useCallback(() => {
    const key = getStorageKey(user?.id);
    localStorage.removeItem(key);
    setActiveLocationId(null);
    window.dispatchEvent(new Event('work-location-changed'));
  }, [user?.id]);


  useEffect(() => {
    if (!activeLocationId) return;
    if (locations.some((location) => location.id === activeLocationId)) return;
    clearActiveLocation();
  }, [activeLocationId, clearActiveLocation, locations]);

  return {
    locations,
    loading,
    activeLocationId,
    setActiveLocation,
    clearActiveLocation,
    refetch: fetchLocations,
  };
}
