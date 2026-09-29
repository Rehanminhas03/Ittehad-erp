import { useCallback } from 'react';
import { sessionCleared } from '@/features/auth/authSlice';
import { useLogoutMutation } from '@/features/auth/authApi.generated';
import { useAppDispatch, useAppSelector } from './store';

export function useAuth() {
  const dispatch = useAppDispatch();
  const { me, status } = useAppSelector((s) => s.auth);
  const [logoutRequest] = useLogoutMutation();

  /** Ends the session on the server (and locally even if that fails). Clearing the session also
   * drops every cached response (see app/store.ts), so the next user never sees this user's data. */
  const logout = useCallback(async () => {
    try {
      await logoutRequest().unwrap();
    } catch {
      // Already expired or offline: the local sign-out below still applies.
    } finally {
      dispatch(sessionCleared());
    }
  }, [dispatch, logoutRequest]);

  return { me, user: me?.user ?? null, status, isAuthenticated: status === 'authenticated', logout };
}
