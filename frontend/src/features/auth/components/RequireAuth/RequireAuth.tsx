import { type ReactNode, useEffect, useRef } from 'react';
import { Navigate, useLocation } from 'react-router';
import { PageSpinner } from '@/shared/components/ui';
import { useAppDispatch, useAppSelector } from '@/shared/hooks';
import { useDevLoginMutation } from '../../authApi';
import { sessionCleared, sessionReceived } from '../../authSlice';
import { DEV_AUTO_LOGIN, DEV_DEFAULT_USER } from '../../devAuth';
import { ChoosePassword } from '../ChoosePassword';

/**
 * Guards the signed-in app. In development (auto sign-in) there is no login page at all: a
 * missing or expired session is silently replaced by signing in as the default admin.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const status = useAppSelector((s) => s.auth.status);
  const mustChangePassword = useAppSelector((s) => s.auth.me?.user.mustChangePassword ?? false);
  const location = useLocation();
  // A password someone else chose (new account, reset): the user picks their own first.
  if (status === 'authenticated') return mustChangePassword ? <ChoosePassword /> : <>{children}</>;
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
