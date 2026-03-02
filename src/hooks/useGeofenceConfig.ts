import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from '@/contexts/AuthContext';

interface GeofenceConfig {
  id: string;
  name?: string;
  center_lat: number;
  center_lng: number;
  radius_meters: number;
  accuracy_threshold: number;
  block_on_poor_accuracy: boolean;
}

function getStorageKey(userId?: string) {
  return userId ? `active-work-location:${userId}` : 'active-work-location:anonymous';
}

export function useGeofenceConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<GeofenceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const selectedLocationId = localStorage.getItem(getStorageKey(user?.id));

      if (selectedLocationId) {
        const { data: locationData } = await supabase
          .from('work_locations')
          .select('*')
          .eq('id', selectedLocationId)
          .eq('is_active', true)
          .maybeSingle();

        if (locationData) {
          setConfig({
            id: locationData.id,
            name: locationData.name,
            center_lat: locationData.center_lat,
            center_lng: locationData.center_lng,
            radius_meters: locationData.radius_meters,
            accuracy_threshold: locationData.accuracy_threshold,
            block_on_poor_accuracy: locationData.block_on_poor_accuracy,
          });
          return;
        }
      }

      const { data, error } = await supabase
        .from('geofence_config')
        .select('*')
        .limit(1)
        .single();

      if (error) throw error;
      setConfig(data);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const updateConfig = async (updates: Partial<GeofenceConfig>) => {
    if (!config) return { error: 'No config found' };

    try {
      const { error } = await supabase
        .from('geofence_config')
        .update(updates)
        .eq('id', config.id);

      if (error) throw error;
      await fetchConfig();
      return { error: null };
    } catch (err: unknown) {
      return { error: getErrorMessage(err) };
    }
  };

  return { config, loading, error, updateConfig, refetch: fetchConfig };
}
