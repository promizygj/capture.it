# Test Execution Architecture

This document explains how a test goes from a button click (or a cron tick, or a CI call) to a stored
report with screenshots and logs.

## Components

```
 ┌──────────────┐  /api (same origin)  ┌──────────────────────────┐        ┌────────────┐
 │ React SPA    │ ───────────────────▶ │ Express API              │ ─────▶ │ PostgreSQL │
 │ Redux Toolkit│ ◀─────────────────── │ auth · CRUD · reports    │        │ (Prisma)   │
 │ RTK Query    │   polling (1.5 s)    │ creates TestRun + results│        └────────────┘
 └──────────────┘                      └────────────┬─────────────┘              ▲
                                                    │ enqueue {runId}            │ results, logs,
 CI/CD ── X-API-Key ──▶ /api/ci/runs ───────────────┤                            │ counters
                                                    ▼                            │
                                       ┌──────────────────────────┐              │
                                       │ Redis · BullMQ           │              │
                                       │ queue "test-runs"        │              │
                                       │ job schedulers (cron)    │              │
                                       └────────────┬─────────────┘              │
                                                    │ jobs                       │
                                       ┌────────────▼─────────────┐              │
                                       │ Worker process(es)       │ ─────────────┘
                                       │ executeRun()             │ ──▶ storage/ (PNG screenshots,
                                       │  └ BrowserPool           │      diffs, visual baselines)
                                       │     └ Playwright         │ ──▶ email / Slack on failure
                                       │       chromium/ff/webkit │
                                       └──────────────────────────┘
```

| Process | Entry point | Scales by |
|---|---|---|
| API | `backend/src/server.ts` | more API containers behind a load balancer |
| Worker | `backend/src/worker.ts` | more worker containers (`--scale worker=N`) and `WORKER_CONCURRENCY` |
| Single container | `EMBEDDED_WORKER=true` runs the worker inside the API | — |

## Data model

```
User ─┬─ ProjectMember (OWNER | EDITOR | VIEWER) ─┬─ Project ─┬─ Environment (baseUrl + variables)
      │                                          │           ├─ TestSuite (category, enabled) ── TestCase
      └─ ApiKey (hashed) ────────────────────────┘           ├─ Schedule (cron, tz, suite?, env?, browsers)
                                                             ├─ VisualBaseline (per case × browser)
                                                             └─ TestRun ── TestResult (per case × browser)
```

* **TestCase** stores the chosen *template*, its *config* (the form values), and the materialised
  `steps` + `expectations` the engine executes. Templates are generators: saving a case runs
  `template.build(config)` on the server, so every case is ultimately a plain list of steps.
* **TestResult** snapshots the case and suite names, so history survives edits and deletions.

## Execution workflow

1. **Create the run** (`services/runService.ts → createRun`)
   * Resolves the environment (explicit or the project default) and the suites (one suite, or all
     *enabled* suites for a project run).
   * Creates the `TestRun` and one `TestResult` per *test case × browser* in a single transaction.
     API tests need no browser and get one result. Disabled cases are stored as `SKIPPED`.
   * Pushes `{ runId }` to the BullMQ `test-runs` queue (job id = run id, so it is never queued twice).
2. **Claim** (`executeRun`) — a worker atomically flips the run `QUEUED → RUNNING` with a conditional
   update. If the run was cancelled meanwhile, the claim fails and the job ends.
3. **Execute** — pending results are processed through a `p-limit` pool sized by the project's
   `maxParallel`. Before each case the worker re-checks for cancellation.
4. **Per case** (`executeResult`)
   * Loads the visual baseline if the case is a visual regression test.
   * Runs the case up to `1 + project.retries` times. A case that passes on a retry is stored as
     `PASSED` with `isFlaky = true`.
   * Saves artifacts (failure screenshot, current image, diff image, new baseline) under
     `STORAGE_DIR/runs/<runId>/…` and stores relative paths.
   * Writes status, timings, attempts, browser version, error message + stack, logs, console errors,
     failed network requests and performance metrics, then increments the live counters.
5. **Finalise** — anything still pending becomes `SKIPPED`, counters are recomputed from the results
   (the source of truth), the run gets `PASSED`/`FAILED`, its duration, and failure notifications are sent.

## The browser engine (`backend/src/engine`)

| File | Responsibility |
|---|---|
| `browserPool.ts` | One browser *process* per browser type per run; each test gets its own isolated `BrowserContext`. Relaunches a crashed browser; tracks every live browser for shutdown cleanup. |
| `executor.ts` | `runBrowserCase` / `runApiCase`: wires event listeners, runs steps and assertions, enforces the timeout, captures screenshots and metrics, classifies errors. |
| `steps.ts` | The step actions (`goto`, `click`, `fill`, `select`, `check`, `hover`, `press`, `waitFor…`) and auto-waiting assertions (`visible`, `textContains`, `urlContains`, `statusBelow`, `noConsoleErrors`, `loadTimeBelow`, …). |
| `templates.ts` | The predefined templates and their form fields. |
| `visual.ts` | Pixel comparison with `pixelmatch`, tolerant of page-size changes. |
| `interpolate.ts` | `{{VARIABLE}}` substitution from the environment and relative URL resolution. |

### Isolation, timeouts and cleanup

* Every test runs in a **fresh browser context** (separate cookies, storage, cache), so parallel tests
  cannot interfere and a failing test never leaks state.
* Each action has a default timeout of `min(timeout, 10 s)`; the **whole test** is raced against its
  configured execution timeout. On expiry the context is closed, which aborts any in-flight Playwright call.
* Contexts are closed in a `finally` block; pools are closed when the run ends; `SIGTERM` on the worker
  closes BullMQ, then every live browser. Tests assert `liveBrowserCount() === 0` after runs.

### Failure classification

| Status | Meaning | Examples |
|---|---|---|
| `FAILED` | The website did not behave as expected | assertion failed, element not found, test timeout |
| `ERROR` | The test could not be executed | site unreachable (`net::ERR_…`), browser crashed, browser failed to launch |

### Browser crashes

If a browser process dies, the running test fails with `ERROR`. `BrowserPool.newContext` detects the dead
browser (even before Playwright reports the disconnect), discards it and launches a new one, so the
remaining tests of the run continue normally. This is covered by `test/engine.test.ts`.

### What is captured

* **Execution log** — timestamped steps, navigations (status + load time), passing/failing assertions, retries.
* **Console errors** — `console.error` messages and uncaught page exceptions.
* **Failed network requests** — aborted requests and every response with status ≥ 400.
* **Performance** — TTFB, first (contentful) paint, DOMContentLoaded, load, transfer size, request count
  (Navigation/Paint/Resource Timing APIs); API tests record response time and payload size.
* **Screenshots** — full-page PNG on failure; current + baseline + diff for visual tests.

Secrets typed with `fill` are never written to the log.

## Scheduling

Each enabled `Schedule` is registered as a BullMQ *job scheduler* (`upsertJobScheduler`) with its cron
pattern and time zone. When it fires, the worker turns the `scheduled` job into a normal run
(`trigger = SCHEDULE`). On start-up the worker re-registers all enabled schedules, so Redis can be
rebuilt from the database at any time.

## Insights

`services/insights.ts` derives quality signals from the last 20 executions of each test:

* **Flaky** — status flips (pass↔fail) plus passes-on-retry, normalised to a 0–1 score.
* **Recurring failures** — current failure streak and failure rate, with the most frequent error.
* **Common errors** — error messages normalised (numbers, URLs stripped) and grouped across tests.
* **Run comparison** — results keyed by test case × browser, labelled *regressed / fixed / changed /
  unchanged / added / removed*, with duration deltas.

## Failure analysis

`POST /api/results/:id/analyze` builds an evidence bundle (error, stack, log tail, console errors, failed
requests, recent pass/fail history) and asks the LLM configured by `ANTHROPIC_MODEL` for a
summary, ranked likely causes and next steps. Without an API key — or if the call fails — a rule-based
analyser produces the same structure, so the feature always works. Results are cached on the test result.

## Security

* Passwords hashed with bcrypt (cost 12); JWT in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in
  production). Changing or resetting a password invalidates existing sessions.
* Password-reset tokens are random, stored only as SHA-256 hashes, single-use and expire after 1 hour;
  the endpoint answers identically whether or not the account exists.
* Every project-scoped route checks membership and role; non-members get `404`.
* CI API keys are shown once and stored hashed; a key can only access its own project.
* Rate limiting on auth endpoints, Helmet headers, request size limits, and path-traversal checks on artifacts.
