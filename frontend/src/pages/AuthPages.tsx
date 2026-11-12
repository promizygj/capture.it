import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Logo } from '../components/Layout';
import { ErrorBox, Field } from '../components/ui';
import { errorMessage, useForgotPasswordMutation, useLoginMutation, useRegisterMutation, useResetPasswordMutation } from '../store/api';
import { useAppDispatch } from '../store';
import { loggedIn } from '../store/authSlice';

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="card p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-5">{children}</div>
        </div>
        {footer && <p className="mt-5 text-center text-sm text-ink-2">{footer}</p>}
      </div>
    </div>
  );
}

const PASSWORD_HINT = 'At least 8 characters, including a letter and a number.';

export function LoginPage() {
  const [login, { isLoading, error }] = useLoginMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await login(form);
    if ('data' in res && res.data) {
      dispatch(loggedIn(res.data.user));
      navigate((location.state as { from?: string } | null)?.from ?? '/dashboard', { replace: true });
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Automate, run and monitor your website tests." footer={<>No account? <Link className="font-medium text-primary hover:underline" to="/register">Create one</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Email" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" className="input" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">Forgot password?</Link>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthShell>
  );
}

export function RegisterPage() {
  const [register, { isLoading, error }] = useRegisterMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const res = await register(form);
    if ('data' in res && res.data) {
      dispatch(loggedIn(res.data.user));
      navigate('/projects/new', { replace: true });
    }
  };

  return (
    <AuthShell title="Create your account" footer={<>Already registered? <Link className="font-medium text-primary hover:underline" to="/login">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
        <Field label="Full name" htmlFor="name">
          <input id="name" className="input" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" className="input" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" htmlFor="password" hint={PASSWORD_HINT}>
          <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        <button type="submit" className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Creating account…' : 'Create account'}</button>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [forgot, { isLoading, error, data }] = useForgotPasswordMutation();
  const [email, setEmail] = useState('');
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="text-primary hover:underline" to="/login">Back to sign in</Link>}>
      {data ? (
        <div className="flex items-start gap-2 text-sm text-ink-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" />
          {data.message}
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); forgot({ email }); }} className="space-y-4">
          {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
          <Field label="Email" htmlFor="email">
            <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={isLoading}>{isLoading ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [reset, { isLoading, error, data }] = useResetPasswordMutation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const mismatch = confirm.length > 0 && password !== confirm;
  return (
    <AuthShell title="Choose a new password" footer={<Link className="text-primary hover:underline" to="/login">Back to sign in</Link>}>
      {!token ? (
        <ErrorBox>This reset link is missing its token. Request a new one.</ErrorBox>
      ) : data ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-ink-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-good" /> {data.message}
          </div>
          <Link to="/login" className="btn-primary w-full">Sign in</Link>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!mismatch) reset({ token, password }); }} className="space-y-4">
          {error && <ErrorBox>{errorMessage(error)}</ErrorBox>}
          <Field label="New password" htmlFor="password" hint={PASSWORD_HINT}>
            <input id="password" className="input" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirm password" htmlFor="confirm" error={mismatch ? 'Passwords do not match' : undefined}>
            <input id="confirm" className="input" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <button type="submit" className="btn-primary w-full" disabled={isLoading || mismatch}>{isLoading ? 'Saving…' : 'Update password'}</button>
        </form>
      )}
    </AuthShell>
  );
}
