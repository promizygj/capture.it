import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { FolderKanban, History, LayoutDashboard, LogOut, Menu, UserCircle, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../store';
import { useLogoutMutation } from '../store/api';
import { loggedOut } from '../store/authSlice';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', Icon: FolderKanban },
  { to: '/runs', label: 'Execution history', Icon: History },
];

export function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-ink">
      <img src="/logo.png" alt="" className="h-8 w-8" width={32} height={32} />
      Capture.It
    </Link>
  );
}

export function Layout() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [logout] = useLogoutMutation();
  const [open, setOpen] = useState(false);

  const signOut = async () => {
    await logout().catch(() => undefined);
    dispatch(loggedOut());
    navigate('/login');
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')
          }
        >
          <Icon className="h-4 w-4" />
          {label}
        </NavLink>
      ))}
      <div className="mt-auto border-t border-line pt-3">
        <NavLink
          to="/profile"
          onClick={() => setOpen(false)}
          className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm', isActive ? 'bg-primary-soft text-primary' : 'text-ink-2 hover:bg-surface-2')}
        >
          <UserCircle className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{user?.name}</span>
        </NavLink>
        <button onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2" data-testid="logout">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-4 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div className="mb-6 px-2">
          <Logo />
        </div>
        {nav}
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Logo />
        <button className="btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside className="flex h-full w-64 flex-col bg-surface px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo />
              <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
