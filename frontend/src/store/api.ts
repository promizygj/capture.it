import { createApi, fetchBaseQuery, type FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import type {
  ApiKey, Comparison, Dashboard, Environment, Insights, Member, Project, ProjectDetail, ProjectListItem, ResultDetail,
  Run, RunDetail, Schedule, Suite, SuiteDetail, TemplatesResponse, TestCase, User, Browser,
} from '../types';
import { loggedOut } from './authSlice';

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api', credentials: 'include' });

/** Wraps the base query so any 401 clears the session and sends the user to the login page. */
const baseQuery: typeof rawBaseQuery = async (args, api, extra) => {
  const result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith('/auth/')) api.dispatch(loggedOut());
  return result;
};

export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as FetchBaseQueryError & { data?: { error?: string; details?: { fieldErrors?: Record<string, string[]> } } };
  if (!e) return fallback;
  if (e.status === 'FETCH_ERROR') return 'Cannot reach the server. Is the API running?';
  const fieldErrors = e.data?.details?.fieldErrors;
  if (fieldErrors && Object.keys(fieldErrors).length) {
    return Object.entries(fieldErrors).map(([k, v]) => `${k}: ${v.join(', ')}`).join('; ');
  }
  return e.data?.error ?? fallback;
}

export interface RunFilters {
  projectId?: string; status?: string; trigger?: string; from?: string; to?: string; page?: number; pageSize?: number; suiteId?: string;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Me', 'Projects', 'Project', 'Suite', 'Case', 'Runs', 'Run', 'Result', 'Schedules', 'Members', 'ApiKeys', 'Dashboard', 'Insights'],
  endpoints: (b) => ({
    /* Auth & profile */
    me: b.query<{ user: User }, void>({ query: () => '/auth/me', providesTags: ['Me'] }),
    login: b.mutation<{ user: User }, { email: string; password: string }>({ query: (body) => ({ url: '/auth/login', method: 'POST', body }) }),
    register: b.mutation<{ user: User }, { name: string; email: string; password: string }>({ query: (body) => ({ url: '/auth/register', method: 'POST', body }) }),
    logout: b.mutation<void, void>({ query: () => ({ url: '/auth/logout', method: 'POST' }) }),
    forgotPassword: b.mutation<{ message: string }, { email: string }>({ query: (body) => ({ url: '/auth/forgot-password', method: 'POST', body }) }),
    resetPassword: b.mutation<{ message: string }, { token: string; password: string }>({ query: (body) => ({ url: '/auth/reset-password', method: 'POST', body }) }),
    updateProfile: b.mutation<{ user: User }, { name?: string; email?: string }>({ query: (body) => ({ url: '/auth/me', method: 'PATCH', body }), invalidatesTags: ['Me'] }),
    changePassword: b.mutation<{ message: string }, { currentPassword: string; newPassword: string }>({ query: (body) => ({ url: '/auth/me/password', method: 'POST', body }) }),

    /* Dashboard */
    dashboard: b.query<Dashboard, { projectId?: string; days?: number }>({
      query: (params) => ({ url: '/dashboard', params }),
      providesTags: ['Dashboard'],
    }),

    /* Projects */
    projects: b.query<{ projects: ProjectListItem[] }, { q?: string } | void>({ query: (p) => ({ url: '/projects', params: p ?? {} }), providesTags: ['Projects'] }),
    project: b.query<{ project: ProjectDetail }, string>({ query: (id) => `/projects/${id}`, providesTags: (_r, _e, id) => [{ type: 'Project', id }] }),
    createProject: b.mutation<{ project: Project }, Partial<Project> & { environments?: { name: string; baseUrl: string }[] }>({
      query: (body) => ({ url: '/projects', method: 'POST', body }), invalidatesTags: ['Projects', 'Dashboard'],
    }),
    updateProject: b.mutation<{ project: Project }, { id: string } & Partial<Project>>({
      query: ({ id, ...body }) => ({ url: `/projects/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => ['Projects', { type: 'Project', id: a.id }],
    }),
    deleteProject: b.mutation<void, string>({ query: (id) => ({ url: `/projects/${id}`, method: 'DELETE' }), invalidatesTags: ['Projects', 'Dashboard', 'Runs'] }),
    insights: b.query<Insights, { projectId: string; days?: number }>({
      query: ({ projectId, days }) => ({ url: `/projects/${projectId}/insights`, params: { days } }), providesTags: ['Insights'],
    }),

    /* Environments */
    saveEnvironment: b.mutation<{ environment: Environment }, { projectId: string; id?: string } & Partial<Environment>>({
      query: ({ projectId, id, ...body }) => ({ url: `/projects/${projectId}/environments${id ? `/${id}` : ''}`, method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Project', id: a.projectId }],
    }),
    deleteEnvironment: b.mutation<void, { projectId: string; id: string }>({
      query: ({ projectId, id }) => ({ url: `/projects/${projectId}/environments/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Project', id: a.projectId }],
    }),

    /* Suites & cases */
    templates: b.query<TemplatesResponse, void>({ query: () => '/templates', keepUnusedDataFor: 3600 }),
    suite: b.query<{ suite: SuiteDetail }, string>({ query: (id) => `/suites/${id}`, providesTags: (_r, _e, id) => [{ type: 'Suite', id }] }),
    createSuite: b.mutation<{ suite: Suite }, { projectId: string; name: string; description?: string; category: string }>({
      query: ({ projectId, ...body }) => ({ url: `/projects/${projectId}/suites`, method: 'POST', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Project', id: a.projectId }, 'Projects'],
    }),
    updateSuite: b.mutation<{ suite: Suite }, { id: string; projectId: string } & Partial<Suite>>({
      query: ({ id, projectId: _p, ...body }) => ({ url: `/suites/${id}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Project', id: a.projectId }, { type: 'Suite', id: a.id }],
    }),
    deleteSuite: b.mutation<void, { id: string; projectId: string }>({
      query: ({ id }) => ({ url: `/suites/${id}`, method: 'DELETE' }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Project', id: a.projectId }, 'Projects'],
    }),
    testCase: b.query<{ testCase: TestCase; history: { id: string; runId: string; status: string; browser: Browser; durationMs: number | null; startedAt: string; errorMessage: string | null; isFlaky: boolean }[]; baselines: { id: string; browser: Browser; updatedAt: string }[] }, string>({
      query: (id) => `/cases/${id}`, providesTags: (_r, _e, id) => [{ type: 'Case', id }],
    }),
    saveCase: b.mutation<{ testCase: TestCase }, { suiteId: string; id?: string } & Partial<TestCase>>({
      query: ({ suiteId, id, ...body }) => (id ? { url: `/cases/${id}`, method: 'PATCH', body } : { url: `/suites/${suiteId}/cases`, method: 'POST', body }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Suite', id: a.suiteId }, ...(a.id ? [{ type: 'Case' as const, id: a.id }] : []), 'Project', 'Projects'],
    }),
    duplicateCase: b.mutation<{ testCase: TestCase }, { id: string; suiteId: string }>({
      query: ({ id }) => ({ url: `/cases/${id}/duplicate`, method: 'POST' }), invalidatesTags: (_r, _e, a) => [{ type: 'Suite', id: a.suiteId }],
    }),
    deleteCase: b.mutation<void, { id: string; suiteId: string }>({
      query: ({ id }) => ({ url: `/cases/${id}`, method: 'DELETE' }), invalidatesTags: (_r, _e, a) => [{ type: 'Suite', id: a.suiteId }, 'Project'],
    }),

    /* Runs */
    startRun: b.mutation<{ run: Run }, { projectId: string; suiteId?: string | null; environmentId?: string | null; browsers?: Browser[] }>({
      query: ({ projectId, ...body }) => ({ url: `/projects/${projectId}/runs`, method: 'POST', body }),
      invalidatesTags: ['Runs', 'Projects', 'Dashboard'],
    }),
    runs: b.query<{ runs: Run[]; total: number; page: number; pageSize: number }, RunFilters>({
      query: (params) => ({ url: '/runs', params }), providesTags: ['Runs'],
    }),
    run: b.query<{ run: RunDetail }, string>({ query: (id) => `/runs/${id}`, providesTags: (_r, _e, id) => [{ type: 'Run', id }] }),
    cancelRun: b.mutation<void, string>({ query: (id) => ({ url: `/runs/${id}/cancel`, method: 'POST' }), invalidatesTags: (_r, _e, id) => [{ type: 'Run', id }, 'Runs'] }),
    rerun: b.mutation<{ run: Run }, string>({ query: (id) => ({ url: `/runs/${id}/rerun`, method: 'POST' }), invalidatesTags: ['Runs', 'Dashboard'] }),
    deleteRun: b.mutation<void, string>({ query: (id) => ({ url: `/runs/${id}`, method: 'DELETE' }), invalidatesTags: ['Runs', 'Dashboard'] }),
    compare: b.query<Comparison, { base: string; head: string }>({ query: (params) => ({ url: '/runs/compare', params }) }),
    result: b.query<{ result: ResultDetail; run: { id: string; projectId: string; status: string; trigger: string }; testCase: (Pick<TestCase, 'id' | 'suiteId' | 'targetUrl' | 'steps' | 'expectations' | 'expectedResult' | 'priority' | 'timeoutMs' | 'description'>) | null; hasBaseline: boolean; history: { id: string; runId: string; status: string; durationMs: number | null; startedAt: string }[] }, string>({
      query: (id) => `/results/${id}`, providesTags: (_r, _e, id) => [{ type: 'Result', id }],
    }),
    analyze: b.mutation<{ analysis: string; source?: 'ai' | 'heuristic'; cached: boolean }, { id: string; refresh?: boolean }>({
      query: ({ id, refresh }) => ({ url: `/results/${id}/analyze`, method: 'POST', params: refresh ? { refresh: 'true' } : {} }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Result', id: a.id }],
    }),
    approveBaseline: b.mutation<void, string>({ query: (id) => ({ url: `/results/${id}/approve-baseline`, method: 'POST' }), invalidatesTags: (_r, _e, id) => [{ type: 'Result', id }] }),

    /* Schedules */
    schedules: b.query<{ schedules: Schedule[] }, string>({ query: (pid) => `/projects/${pid}/schedules`, providesTags: ['Schedules'] }),
    saveSchedule: b.mutation<{ schedule: Schedule }, { projectId: string; id?: string } & Partial<Schedule>>({
      query: ({ projectId, id, ...body }) => ({ url: `/projects/${projectId}/schedules${id ? `/${id}` : ''}`, method: id ? 'PATCH' : 'POST', body }),
      invalidatesTags: ['Schedules'],
    }),
    deleteSchedule: b.mutation<void, { projectId: string; id: string }>({
      query: ({ projectId, id }) => ({ url: `/projects/${projectId}/schedules/${id}`, method: 'DELETE' }), invalidatesTags: ['Schedules'],
    }),

    /* Team */
    members: b.query<{ members: Member[] }, string>({ query: (pid) => `/projects/${pid}/members`, providesTags: ['Members'] }),
    addMember: b.mutation<{ member: Member }, { projectId: string; email: string; role: string }>({
      query: ({ projectId, ...body }) => ({ url: `/projects/${projectId}/members`, method: 'POST', body }), invalidatesTags: ['Members'],
    }),
    updateMember: b.mutation<void, { projectId: string; id: string; role: string }>({
      query: ({ projectId, id, role }) => ({ url: `/projects/${projectId}/members/${id}`, method: 'PATCH', body: { role } }), invalidatesTags: ['Members'],
    }),
    removeMember: b.mutation<void, { projectId: string; id: string }>({
      query: ({ projectId, id }) => ({ url: `/projects/${projectId}/members/${id}`, method: 'DELETE' }), invalidatesTags: ['Members', 'Projects'],
    }),

    /* API keys */
    apiKeys: b.query<{ apiKeys: ApiKey[] }, string>({ query: (pid) => `/projects/${pid}/api-keys`, providesTags: ['ApiKeys'] }),
    createApiKey: b.mutation<{ apiKey: ApiKey; key: string }, { projectId: string; name: string }>({
      query: ({ projectId, name }) => ({ url: `/projects/${projectId}/api-keys`, method: 'POST', body: { name } }), invalidatesTags: ['ApiKeys'],
    }),
    deleteApiKey: b.mutation<void, { projectId: string; id: string }>({
      query: ({ projectId, id }) => ({ url: `/projects/${projectId}/api-keys/${id}`, method: 'DELETE' }), invalidatesTags: ['ApiKeys'],
    }),
  }),
});

export const {
  useMeQuery, useLoginMutation, useRegisterMutation, useLogoutMutation, useForgotPasswordMutation, useResetPasswordMutation,
  useUpdateProfileMutation, useChangePasswordMutation, useDashboardQuery, useProjectsQuery, useProjectQuery, useCreateProjectMutation,
  useUpdateProjectMutation, useDeleteProjectMutation, useInsightsQuery, useSaveEnvironmentMutation, useDeleteEnvironmentMutation,
  useTemplatesQuery, useSuiteQuery, useCreateSuiteMutation, useUpdateSuiteMutation, useDeleteSuiteMutation, useTestCaseQuery,
  useSaveCaseMutation, useDuplicateCaseMutation, useDeleteCaseMutation, useStartRunMutation, useRunsQuery, useRunQuery,
  useCancelRunMutation, useRerunMutation, useDeleteRunMutation, useCompareQuery, useResultQuery, useAnalyzeMutation,
  useApproveBaselineMutation, useSchedulesQuery, useSaveScheduleMutation, useDeleteScheduleMutation, useMembersQuery,
  useAddMemberMutation, useUpdateMemberMutation, useRemoveMemberMutation, useApiKeysQuery, useCreateApiKeyMutation, useDeleteApiKeyMutation,
} = api;
