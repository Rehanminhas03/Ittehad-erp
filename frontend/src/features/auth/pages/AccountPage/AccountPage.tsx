import { useState } from 'react';
import { Button, Field, Input, PageHeader, Section } from '@/shared/components/ui';
import { useAppDispatch, useAuth, useToast } from '@/shared/hooks';
import { apiFieldErrors } from '@/shared/lib';
import { useChangePasswordMutation, useUpdateProfileMutation } from '../../authApi';
import { meRefreshed, sessionReceived } from '../../authSlice';

/** Profile section: name and phone. Email and roles are managed by an administrator. */
function ProfileSection() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [update, { isLoading }] = useUpdateProfileMutation();
  const dirty = fullName.trim() !== (user?.fullName ?? '') || phone.trim() !== (user?.phone ?? '');

  return (
    <Section title="Profile">
      <div className="grid max-w-md grid-cols-1 gap-4">
        <Field label="Email" htmlFor="email" hint="Contact an administrator to change your email.">
          <Input id="email" value={user?.email ?? ''} disabled />
        </Field>
        <Field label="Full name" htmlFor="fullName" required>
          <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03xx-xxxxxxx" />
        </Field>
        <div>
          <Button
            disabled={!dirty || fullName.trim().length < 2}
            loading={isLoading}
            onClick={async () => {
              try {
                const me = await update({ profileUpdate: { fullName: fullName.trim(), phone: phone.trim() || null } }).unwrap();
                dispatch(meRefreshed(me));
                toast.success('Profile updated');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Save changes
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Password section: changing it signs out every other session (this one stays signed in). */
function PasswordSection() {
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [change, { isLoading }] = useChangePasswordMutation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mismatch = confirm.length > 0 && newPassword !== confirm;
  const valid = currentPassword.length > 0 && newPassword.length >= 10 && newPassword === confirm;

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirm('');
  };

  return (
    <Section title="Password" className="max-w-md">
      <div className="grid grid-cols-1 gap-4">
        <Field label="Current password" htmlFor="currentPassword" required error={errors.currentPassword}>
          <Input id="currentPassword" type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </Field>
        <Field label="New password" htmlFor="newPassword" required hint="At least 10 characters, with a letter and a digit." error={errors.newPassword}>
          <Input id="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirmPassword" required error={mismatch ? 'Passwords do not match' : undefined}>
          <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <div>
          <Button
            disabled={!valid}
            loading={isLoading}
            onClick={async () => {
              setErrors({});
              try {
                const session = await change({ changePasswordRequest: { currentPassword, newPassword } }).unwrap();
                dispatch(sessionReceived(session));
                toast.success('Password changed. Your other sessions were signed out.');
                reset();
              } catch (e) {
                setErrors(Object.fromEntries(apiFieldErrors(e).map((i) => [i.path, i.message])));
                toast.error(e);
              }
            }}
          >
            Change password
          </Button>
        </div>
      </div>
    </Section>
  );
}

/** Self-service account settings: every signed-in user can reach this, regardless of role. */
export default function AccountPage() {
  return (
    <div>
      <PageHeader title="My account" subtitle="Manage your profile and password." />
      <ProfileSection />
      <PasswordSection />
    </div>
  );
}
