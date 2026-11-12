import { useEffect, useRef } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { PageLoader } from './components/ui';
import { useAppDispatch, useAppSelector } from './store';
import { useMeQuery } from './store/api';
import { loggedIn, loggedOut } from './store/authSlice';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectNewPage } from './pages/ProjectNewPage';
import { ProjectPage } from './pages/ProjectPage';
import { SuitePage } from './pages/SuitePage';
import { RunsPage } from './pages/RunsPage';
import { RunPage } from './pages/RunPage';
import { ProfilePage } from './pages/ProfilePage';

/** Resolves the session once on load and syncs it into the auth slice */
function SessionGate() {
  const dispatch = useAppDispatch();
  const status = useAppSelector((s) => s.auth.status);
  // Only probe the session on first load; afterwards login/logout update the slice directly
  const { data, isError, isSuccess } = useMeQuery(undefined, { skip: status !== 'unknown' });
  useEffect(() => {
    if (status !== 'unknown') return;
    if (isSuccess && data) dispatch(loggedIn(data.user));
    else if (isError) dispatch(loggedOut());
  }, [status, isSuccess, isError, data, dispatch]);
  if (status === 'unknown') return <PageLoader />;
  return (
    <>
      <Outlet />
      <Toasts />
    </>
  );
}

function RequireAuth() {
  const status = useAppSelector((s) => s.auth.status);
  const location = useLocation();
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <Layout />;
}

/** Redirects users who were already signed in when opening a guest page. Users who sign in *on* the
 *  page are navigated by the page itself (e.g. register → create first project). */
function GuestOnly() {
  const status = useAppSelector((s) => s.auth.status);
  const initial = useRef(status);
  return initial.current === 'authenticated' ? <Navigate to="/dashboard" replace /> : <Outlet />;
}

export const router = createBrowserRouter([
  {
    element: <SessionGate />,
    children: [
      {
        element: <GuestOnly />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          { path: '/', element: <Navigate to="/dashboard" replace /> },
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/projects', element: <ProjectsPage /> },
          { path: '/projects/new', element: <ProjectNewPage /> },
          { path: '/projects/:projectId', element: <ProjectPage /> },
          { path: '/projects/:projectId/suites/:suiteId', element: <SuitePage /> },
          { path: '/projects/:projectId/suites/:suiteId/cases/new', lazy: async () => ({ Component: (await import('./pages/CaseEditorPage')).CaseEditorPage }) },
          { path: '/projects/:projectId/suites/:suiteId/cases/:caseId', lazy: async () => ({ Component: (await import('./pages/CaseEditorPage')).CaseEditorPage }) },
          { path: '/runs', element: <RunsPage /> },
          { path: '/runs/compare', lazy: async () => ({ Component: (await import('./pages/ComparePage')).ComparePage }) },
          { path: '/runs/:runId', element: <RunPage /> },
          { path: '/results/:resultId', lazy: async () => ({ Component: (await import('./pages/ResultPage')).ResultPage }) },
          { path: '/profile', element: <ProfilePage /> },
          { path: '/guide', lazy: async () => ({ Component: (await import('./pages/GuidePage')).GuidePage }) },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
        ],
      },
    ],
  },
]);
