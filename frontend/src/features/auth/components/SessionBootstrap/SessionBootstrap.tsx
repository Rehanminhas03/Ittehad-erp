import { type ReactNode, useEffect, useRef } from 'react';
import { PageSpinner } from '@/shared/components/ui';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { useDevLoginMutation, useRefreshSessionMutation } from '../../authApi';
import { sessionCleared, sessionReceived } from '../../authSlice';
import { DEV_AUTO_LOGIN, DEV_DEFAULT_USER } from '../../devAuth';

/**
 * On first load: restore the session from the httpOnly refresh cookie; failing that, in
 * development, sign in automatically as the default admin so no login page is needed.
 */
export function SessionBootstrap({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const dispatch = useAppDispatch();
  const [refresh] = useRefreshSessionMutation();
  const [devLogin] = useDevLoginMutation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || status !== 'checking') return;
    started.current = true;
    (async () => {
      try {
        dispatch(sessionReceived(await refresh().unwrap()));
        return;
      } catch {
        // no valid refresh cookie
      }
      if (DEV_AUTO_LOGIN) {
        try {
          dispatch(sessionReceived(await devLogin({ devLoginRequest: { email: DEV_DEFAULT_USER } }).unwrap()));
          return;
        } catch {
          // backend has dev sign-in disabled: fall through to the login page
        }
      }
      dispatch(sessionCleared());
    })();
  }, [dispatch, refresh, devLogin, status]);

  if (status === 'checking') return <PageSpinner />;
  return <>{children}</>;
}
