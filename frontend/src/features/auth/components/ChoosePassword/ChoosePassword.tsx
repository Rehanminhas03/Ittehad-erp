import { Button } from '@/shared/components/ui';
import { useAuth } from '@/shared/hooks';
import { PasswordSection } from '../../pages/AccountPage/AccountPage';
import { BrandLogo, type LogoAsset } from '../BrandLogo';

const GROUP_LOGO: LogoAsset = { file: 'Ittehadmotors-logo.png', name: 'Ittehad Motors', crop: 'inset(7% 11% 10% 10%)' };

/**
 * Shown instead of the app when someone else chose this user's password (a new account, or a
 * reset by the manager): the user picks their own before going on.
 */
export function ChoosePassword() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 py-8">
      <BrandLogo logo={GROUP_LOGO} className="h-12 self-start" />
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Welcome, {user?.fullName}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Your manager set a temporary password for you. Choose your own password to continue: only you will know it.
        </p>
      </div>
      <PasswordSection title="Choose your password" currentLabel="Temporary password (the one you just signed in with)" />
      <div>
        <Button variant="secondary" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}
