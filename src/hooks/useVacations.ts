import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/lib/errors';

export type VacationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface VacationRequest {
  id: string;
  user_id: string;
  department_id: string;
  start_date: string;
  end_date: string;
  requested_days: number;
  status: VacationStatus;
  reason: string | null;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VacationBalance {
  worked_days: number;
  accrual_rate: number;
  earned_days: number;
  approved_days: number;
  pending_days: number;
  available_days: number;
}

const EMPTY_BALANCE: VacationBalance = {
  worked_days: 0,
  accrual_rate: 0,
  earned_days: 0,
  approved_days: 0,
  pending_days: 0,
  available_days: 0,
};

export function useVacations() {
  const { user, role, profile } = useAuth();
  const [myRequests, setMyRequests] = useState<VacationRequest[]>([]);
  const [reviewQueue, setReviewQueue] = useState<VacationRequest[]>([]);
  const [balance, setBalance] = useState<VacationBalance>(EMPTY_BALANCE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReview = role === 'global_manager' || role === 'department_head';
  const canRequestPersonalVacations = role !== 'global_manager';

  const mapVacationModuleError = (error: unknown): string => {
    const message = getErrorMessage(error);
    const normalized = message.toLowerCase();
    const status = typeof error === 'object' && error !== null ? (error as { status?: number }).status : undefined;
    const code = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;

    if (
      status === 404 ||
      code === 'PGRST202' ||
      code === '42883' ||
      normalized === 'ha ocurrido un error inesperado' ||
      normalized.includes('error http 404') ||
      normalized.includes('status code 404') ||
      normalized.includes('vacation_requests') ||
      normalized.includes('get_vacation_balance') ||
      normalized.includes('function') && normalized.includes('does not exist')
    ) {
      return 'El módulo de vacaciones aún no está desplegado en la base de datos. Ejecuta las migraciones pendientes de Supabase.';
    }

    return message;
  };

  const fetchBalance = useCallback(async () => {
    if (!user || !canRequestPersonalVacations) {
      setBalance(EMPTY_BALANCE);
      return;
    }

    const year = new Date().getFullYear();
    const { data, error: rpcError } = await supabase.rpc('get_vacation_balance', {
      _user_id: user.id,
      _year: year,
    });

    if (rpcError) throw rpcError;

    const row = data?.[0] ?? null;

    if (!row) {
      setBalance(EMPTY_BALANCE);
      return;
    }

    setBalance({
      worked_days: Number(row.worked_days ?? 0),
      accrual_rate: Number(row.accrual_rate ?? 0),
      earned_days: Number(row.earned_days ?? 0),
      approved_days: Number(row.approved_days ?? 0),
      pending_days: Number(row.pending_days ?? 0),
      available_days: Number(row.available_days ?? 0),
    });
  }, [canRequestPersonalVacations, user]);

  const fetchMyRequests = useCallback(async () => {
    if (!user || !canRequestPersonalVacations) {
      setMyRequests([]);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('vacation_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (fetchError) throw fetchError;

    setMyRequests((data ?? []) as VacationRequest[]);
  }, [canRequestPersonalVacations, user]);

  const fetchReviewQueue = useCallback(async () => {
    if (!canReview) {
      setReviewQueue([]);
      return;
    }

    let query = supabase
      .from('vacation_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (role === 'department_head' && profile?.department_id) {
      query = query.eq('department_id', profile.department_id);
    }

    const { data, error: fetchError } = await query;
    if (fetchError) throw fetchError;

    setReviewQueue((data ?? []) as VacationRequest[]);
  }, [canReview, role, profile?.department_id]);

  const refresh = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await Promise.all([fetchMyRequests(), fetchBalance(), fetchReviewQueue()]);
    } catch (err: unknown) {
      setError(mapVacationModuleError(err));
    } finally {
      setLoading(false);
    }
  }, [fetchBalance, fetchMyRequests, fetchReviewQueue, user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const requestVacation = useCallback(async (startDate: string, endDate: string, reason?: string) => {
    if (!canRequestPersonalVacations) {
      return { error: 'Los gestores globales no pueden solicitar vacaciones personales.' };
    }

    const { error: rpcError } = await supabase.rpc('request_vacation', {
      _start_date: startDate,
      _end_date: endDate,
      _reason: reason?.trim() || null,
    });

    if (rpcError) {
      return { error: mapVacationModuleError(rpcError) };
    }

    await refresh();
    return { error: null };
  }, [canRequestPersonalVacations, refresh]);

  const cancelRequest = useCallback(async (requestId: string) => {
    const { error: rpcError } = await supabase.rpc('cancel_vacation_request', {
      _request_id: requestId,
    });

    if (rpcError) {
      return { error: getErrorMessage(rpcError) };
    }

    await refresh();
    return { error: null };
  }, [refresh]);

  const reviewRequest = useCallback(async (
    requestId: string,
    decision: 'approved' | 'rejected',
    reviewComment?: string,
  ) => {
    const { error: rpcError } = await supabase.rpc('review_vacation_request', {
      _request_id: requestId,
      _decision: decision,
      _review_comment: reviewComment?.trim() || null,
    });

    if (rpcError) {
      return { error: getErrorMessage(rpcError) };
    }

    await refresh();
    return { error: null };
  }, [refresh]);

  const pendingMine = useMemo(
    () => myRequests.filter((item) => item.status === 'pending').length,
    [myRequests]
  );

  return {
    loading,
    error,
    balance,
    myRequests,
    reviewQueue,
    pendingMine,
    canReview,
    canRequestPersonalVacations,
    requestVacation,
    cancelRequest,
    reviewRequest,
    refresh,
  };
}
