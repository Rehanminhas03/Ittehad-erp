import { useMemo } from 'react';
import { toastShown } from '@/features/ui/uiSlice';
import { apiErrorMessage } from '@/shared/lib';
import { useAppDispatch } from './store';

export function useToast() {
  const dispatch = useAppDispatch();
  return useMemo(
    () => ({
      success: (m: string) => dispatch(toastShown('success', m)),
      info: (m: string) => dispatch(toastShown('info', m)),
      error: (e: unknown, fallback?: string) => dispatch(toastShown('error', typeof e === 'string' ? e : apiErrorMessage(e, fallback))),
    }),
    [dispatch],
  );
}
