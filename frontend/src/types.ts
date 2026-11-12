export type Role = 'OWNER' | 'EDITOR' | 'VIEWER';
export type Browser = 'chromium' | 'firefox' | 'webkit';
export type RunStatus = 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'ERROR' | 'CANCELLED';
export type ResultStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED' | 'ERROR';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface User { id: string; email: string; name: string; createdAt: string }

export interface Environment { id: string; name: string; baseUrl: string; variables: Record<string, string>; isDefault: boolean }

export interface RunSummary {
  id: string; status: RunStatus; passed: number; failed: number; total: number; skipped?: number; queuedAt: string;
}

export interface Project {
  id: string; name: string; description: string | null; baseUrl: string; defaultBrowsers: Browser[];
  maxParallel: number; retries: number; notifyEmail: boolean; slackWebhookUrl: string | null;
  createdAt: string; updatedAt: string; role?: Role;
}
export interface ProjectListItem extends Project {
  _count: { suites: number; runs: number }; lastRun: RunSummary | null; caseCount: number;
}
export interface Suite {
  id: string; projectId: string; name: string; description: string | null; category: string; enabled: boolean;
  position: number; _count?: { cases: number }; enabledCases?: number;
}
export interface ProjectDetail extends Project { environments: Environment[]; suites: Suite[] }

export interface Step { action: string; selector?: string; value?: string; description?: string }
export interface Expectation { type: string; selector?: string; value?: string }

export interface TestCase {
  id: string; suiteId: string; name: string; description: string | null; template: string; targetUrl: string;
  config: Record<string, unknown>; steps: Step[]; expectations: Expectation[]; expectedResult: string | null;
  priority: Priority; timeoutMs: number; enabled: boolean; position: number;
  lastResult?: { status: ResultStatus; startedAt: string; durationMs: number | null; runId: string } | null;
}
export interface SuiteDetail extends Suite { project: { id: string; name: string; baseUrl: string }; cases: TestCase[]; role: Role }

export interface TemplateField {
  name: string; label: string; type: 'text' | 'password' | 'number' | 'textarea' | 'select' | 'boolean' | 'pairs' | 'keyvalue';
  required?: boolean; placeholder?: string; help?: string; default?: unknown; options?: string[];
}
export interface Template {
  key: string; name: string; category: string; description: string; kind: 'browser' | 'api'; editableSteps?: boolean;
  fields: TemplateField[]; defaults: { targetUrl: string; expectedResult: string };
}
export interface TemplatesResponse { templates: Template[]; stepActions: string[]; assertionTypes: string[]; categories: string[] }

export interface Run {
  id: string; projectId: string; suiteId: string | null; environmentId: string | null; trigger: 'MANUAL' | 'SCHEDULE' | 'CI';
  status: RunStatus; browsers: Browser[]; total: number; passed: number; failed: number; skipped: number; flaky: number;
  errorMessage: string | null; ciMetadata: Record<string, string> | null;
  queuedAt: string; startedAt: string | null; finishedAt: string | null; durationMs: number | null;
  project?: { id: string; name: string; baseUrl?: string; retries?: number; maxParallel?: number };
  suite?: { id?: string; name: string } | null; environment?: { id?: string; name: string; baseUrl?: string } | null;
  triggeredBy?: { name: string } | null;
}
export interface ResultRow {
  id: string; testCaseId: string | null; testCaseName: string; suiteName: string; template: string; browser: Browser;
  browserVersion: string | null; status: ResultStatus; attempts: number; isFlaky: boolean; startedAt: string | null;
  finishedAt: string | null; durationMs: number | null; errorMessage: string | null; screenshotPath: string | null; diffRatio: number | null;
}
export interface RunDetail extends Run { results: ResultRow[] }

export interface LogEntry { t: number; level: 'info' | 'warn' | 'error' | 'step' | 'pass' | 'fail'; message: string }
export interface ResultDetail extends ResultRow {
  runId: string; errorStack: string | null; diffPath: string | null; logs: LogEntry[];
  consoleErrors: { type: string; text: string; location?: string }[];
  networkFailures: { url: string; method: string; status?: number; failure?: string; resourceType?: string }[];
  metrics: Record<string, number> | null; aiAnalysis: string | null;
}

export interface Schedule {
  id: string; name: string; cron: string; timezone: string; browsers: Browser[]; enabled: boolean; suiteId: string | null;
  environmentId: string | null; lastRunAt: string | null; nextRunAt: string | null; suite?: { name: string } | null; environment?: { name: string } | null;
}
export interface Member { id: string; role: Role; user: { id: string; name: string; email: string } }
export interface ApiKey { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string; createdBy: { name: string } }

export interface Dashboard {
  days: number;
  totals: { executed: number; passed: number; failed: number; skipped: number; successRate: number | null; avgDurationMs: number | null };
  trend: { day: string; passed: number; failed: number; skipped: number }[];
  byProject: { projectId: string; name: string; runs: number; passed: number; failed: number; skipped: number; successRate: number | null }[];
  recentRuns: Run[];
}
export interface Insights {
  days: number;
  flaky: { testCaseId: string; name: string; suiteName: string; executions: number; failures: number; flips: number; retryPasses: number; flakinessScore: number; recent: ('P' | 'F')[] }[];
  recurring: { testCaseId: string; name: string; suiteName: string; executions: number; failures: number; failureRate: number; currentStreak: number; topError: string; topErrorCount: number; lastFailedAt: string | null }[];
  commonErrors: { signature: string; count: number; tests: string[] }[];
  slowest: { testCaseId: string; name: string; suiteName: string; avgDurationMs: number }[];
}
export interface Comparison {
  base: Run; head: Run; summary: Record<string, number>;
  rows: { key: string; name: string; suiteName: string; browser: Browser; change: 'fixed' | 'regressed' | 'unchanged' | 'added' | 'removed' | 'changed';
    base: { resultId: string; status: ResultStatus; durationMs: number | null; error: string | null } | null;
    head: { resultId: string; status: ResultStatus; durationMs: number | null; error: string | null } | null; durationDeltaMs: number | null }[];
}
