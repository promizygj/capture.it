import { useState } from 'react';
import { errorMessage, useChangePasswordMutation, useUpdateProfileMutation } from '../store/api';
import { useAppDispatch, useAppSelector } from '../store';
import { loggedIn } from '../store/authSlice';
import { ErrorBox, Field, PageHeader } from '../components/ui';
import { useToast } from '../lib/useToast';
import { formatDate } from '../lib/format';

export function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user)!;
  const dispatch = useAppDispatch();
  const toast = useToast();
  const [update, u] = useUpdateProfileMutation();
  const [change, c] = useChangePasswordMutation();
  const [profile, setProfile] = useState({ name: user.name, email: user.email });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const mismatch = pw.confirm.length > 0 && pw.newPassword !== pw.confirm;

  return (
    <>
      <PageHeader title="Your profile" subtitle={`Member since ${formatDate(user.createdAt)}`} />
      <div className="max-w-xl space-y-6">
        <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); const r = await update(profile); if ('data' in r && r.data) { dispatch(loggedIn(r.data.user)); toast('success', 'Profile updated'); } }}>
          <h2 className="font-semibold">Profile</h2>
          {u.error && <ErrorBox>{errorMessage(u.error)}</ErrorBox>}
          <Field label="Name" htmlFor="pr-name"><input id="pr-name" className="input" required value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></Field>
          <Field label="Email" htmlFor="pr-email"><input id="pr-email" className="input" type="email" required value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
          <div className="flex justify-end"><button className="btn-primary" disabled={u.isLoading}>Save profile</button></div>
        </form>
        <form className="card space-y-4 p-5" onSubmit={async (e) => { e.preventDefault(); if (mismatch) return; const r = await change({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }); if ('data' in r) { setPw({ currentPassword: '', newPassword: '', confirm: '' }); toast('success', 'Password changed. Other sessions were signed out.'); } }}>
          <h2 className="font-semibold">Change password</h2>
          {c.error && <ErrorBox>{errorMessage(c.error)}</ErrorBox>}
          <Field label="Current password" htmlFor="pw-cur"><input id="pw-cur" className="input" type="password" autoComplete="current-password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} /></Field>
          <Field label="New password" htmlFor="pw-new" hint="At least 8 characters, including a letter and a number."><input id="pw-new" className="input" type="password" autoComplete="new-password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} /></Field>
          <Field label="Confirm new password" htmlFor="pw-conf" error={mismatch ? 'Passwords do not match' : undefined}><input id="pw-conf" className="input" type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
          <div className="flex justify-end"><button className="btn-primary" disabled={c.isLoading || mismatch}>Change password</button></div>
        </form>
      </div>
    </>
  );
}
