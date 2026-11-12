export const STEP_ACTIONS = [
  'goto',
  'click',
  'fill',
  'select',
  'check',
  'uncheck',
  'hover',
  'press',
  'waitForSelector',
  'waitForUrl',
  'waitForTimeout',
  'scrollIntoView',
] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];

export interface Step {
  action: StepAction;
  selector?: string;
  value?: string;
  description?: string;
}

export const ASSERTION_TYPES = [
  'visible',
  'hidden',
  'textContains',
  'textEquals',
  'valueEquals',
  'count',
  'urlContains',
  'titleContains',
  'statusBelow',
  'noConsoleErrors',
  'loadTimeBelow',
] as const;
export type AssertionType = (typeof ASSERTION_TYPES)[number];

export interface Expectation {
  type: AssertionType;
  selector?: string;
  value?: string;
}

export type LogLevel = 'info' | 'warn' | 'error' | 'step' | 'pass' | 'fail';
export interface LogEntry {
  t: number; // ms since case start
  level: LogLevel;
  message: string;
}

export interface ConsoleError {
  type: string;
  text: string;
  location?: string;
}

export interface NetworkFailure {
  url: string;
  method: string;
  status?: number;
  failure?: string;
  resourceType?: string;
}

export interface PerfMetrics {
  ttfbMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  firstPaintMs?: number;
  firstContentfulPaintMs?: number;
  transferSizeKb?: number;
  requestCount?: number;
  responseTimeMs?: number; // API tests
}

export interface CaseInput {
  id: string;
  name: string;
  template: string;
  targetUrl: string;
  config: Record<string, unknown>;
  steps: Step[];
  expectations: Expectation[];
  timeoutMs: number;
}

export interface ExecutionContext {
  baseUrl: string;
  variables: Record<string, string>;
  /** Directory key under storage for artifacts of this result */
  artifactKey: string;
  /** Visual baseline for this case/browser, if any */
  baseline?: Buffer | null;
  visualThreshold?: number;
}

export type CaseStatus = 'PASSED' | 'FAILED' | 'ERROR';

export interface CaseOutcome {
  status: CaseStatus;
  durationMs: number;
  errorMessage?: string;
  errorStack?: string;
  screenshot?: Buffer;
  /** Visual regression outputs */
  currentImage?: Buffer;
  diffImage?: Buffer;
  diffRatio?: number;
  logs: LogEntry[];
  consoleErrors: ConsoleError[];
  networkFailures: NetworkFailure[];
  metrics?: PerfMetrics;
}

/** Thrown when an assertion fails – distinguishes FAILED (test failed) from ERROR (infra problem) */
export class AssertionFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionFailure';
  }
}
