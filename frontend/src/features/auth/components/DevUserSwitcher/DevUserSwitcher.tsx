import { useNavigate } from 'react-router';
import { Select } from '@/shared/components/ui';
import { useAppDispatch, useAuth, useToast } from '@/shared/hooks';
import { baseApi } from '@/shared/api/baseApi';
import { useDevLoginMutation, useListDevAccountsQuery } from '../../authApi';
import { sessionReceived } from '../../authSlice';
import { DEV_AUTO_LOGIN } from '../../devAuth';

/**
 * Development only: switch the signed-in user without passwords, to try the app as a
 * dealership manager (scoped) or as the admin (everything). Renders nothing in production.
 */
export function DevUserSwitcher() {
  if (!DEV_AUTO_LOGIN) return null;
  return <Switcher />;
}

function Switcher() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: accounts } = useListDevAccountsQuery();
  const [devLogin, { isLoading }] = useDevLoginMutation();

  async function switchTo(email: string) {
    try {
      const session = await devLogin({ devLoginRequest: { email } }).unwrap();
      // Nothing cached for the previous user may leak into the next one.
      dispatch(baseApi.util.resetApiState());
      dispatch(sessionReceived(session));
      navigate('/');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-slate-500">
      <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 font-semibold tracking-wide text-amber-800 md:inline">DEV</span>
      <Select
        aria-label="Switch user (development)"
        className="w-52 py-1.5 text-xs"
        value={user?.email ?? ''}
        disabled={isLoading}
        onChange={(e) => void switchTo(e.target.value)}
      >
        {(accounts ?? (user ? [{ email: user.email, fullName: user.fullName }] : [])).map((a) => (
          <option key={a.email} value={a.email}>
            {a.fullName}
          </option>
        ))}
      </Select>
    </label>
  );
}
