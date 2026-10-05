import { useState } from 'react';
import { Button, Dialog, Field, Input } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { useUpdateUserMutation } from '../../adminApi';

/** A temporary password: 12 characters with letters and digits (no look-alikes such as O / 0, l / 1). */
function temporaryPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const all = letters + digits;
  const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0]! % s.length]!;
  const chars = [pick(letters), pick(digits), ...Array.from({ length: 10 }, () => pick(all))];
  return chars.sort(() => crypto.getRandomValues(new Uint8Array(1))[0]! - 128).join('');
}

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{10,}$/;

/**
 * "Reset password" on a staff member's page: the manager sets a temporary password (typed twice, or
 * suggested), which the person replaces with their own at next sign-in. Signs them out everywhere.
 */
export function ResetPassword({ userId, fullName }: { userId: number; fullName: string }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [update, { isLoading }] = useUpdateUserMutation();
  const weak = password.length > 0 && !STRONG.test(password);
  const mismatch = confirm.length > 0 && confirm !== password;
  const close = () => {
    setOpen(false);
    setPassword('');
    setConfirm('');
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Reset password
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={`Reset password — ${fullName}`}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={!STRONG.test(password) || password !== confirm}
              loading={isLoading}
              onClick={async () => {
                try {
                  await update({ id: userId, userUpdate: { password } }).unwrap();
                  toast.success(`Password reset. Give ${fullName} the temporary password: they choose their own when they sign in.`);
                  close();
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Reset password
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4">
          <p className="text-sm text-slate-600">
            {fullName} is signed out everywhere and signs in with this temporary password, then chooses their own.
          </p>
          <Field label="Temporary password" htmlFor="rp-password" required hint="At least 10 characters with a letter and a digit" error={weak ? 'At least 10 characters with a letter and a digit' : undefined}>
            <Input id="rp-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="rp-confirm" required error={mismatch ? 'Passwords do not match' : undefined}>
            <Input id="rp-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const p = temporaryPassword();
                setPassword(p);
                setConfirm(p);
                void navigator.clipboard?.writeText(p).catch(() => undefined);
                toast.success(`Suggested password ${p} (copied). Press the eye to see it.`);
              }}
            >
              Suggest a password
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
