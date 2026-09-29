import { type ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageSpinner } from '@/shared/components/ui';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { useDevLoginMutation } from '../../authApi';
import { sessionCleared, sessionReceived } from '../../authSlice';
import { DEV_AUTO_LOGIN, DEV_DEFAULT_USER } from '../../devAuth';

/**
 * Guards the signed-in app. In development (auto sign-in) there is no login page at all: a
 * missing or expired session is silently replaced by signing in as the default admin.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status === 'authenticated') return <>{children}</>;
  if (DEV_AUTO_LOGIN) return <DevAutoLogin />;
  return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

function DevAutoLogin() {
  const dispatch = useAppDispatch();
  const [devLogin] = useDevLoginMutation();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    devLogin({ devLoginRequest: { email: DEV_DEFAULT_USER } })
      .unwrap()
      .then((s) => dispatch(sessionReceived(s)))
      .catch(() => dispatch(sessionCleared()));
  }, [devLogin, dispatch]);
  return <PageSpinner />;
}
