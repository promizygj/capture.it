# Capture.It — Automated Website Testing

One platform for test management, execution, quality monitoring and reporting.

A full-stack platform to configure, execute and monitor automated website tests powered by
**Playwright**. Create a project for a website, build test suites from predefined templates, run them
on Chromium, Firefox and WebKit — manually, on a schedule, or from CI — and review results, screenshots,
logs and trends in one dashboard.

| Layer | Tech |
|---|---|
| Frontend | React 19 (Vite), Redux Toolkit + RTK Query, React Router, Tailwind CSS v4 |
| Backend | Node 22, Express 5, TypeScript, Zod, Prisma 6 + PostgreSQL 16 |
| Execution | Playwright (Chromium, Firefox, WebKit), BullMQ + Redis job queue and scheduler |
| Extras | pixelmatch visual diffs, Nodemailer, Slack webhooks, LLM-based failure analysis (Anthropic API) |

## Features

- **Accounts** — register, sign in/out, password recovery by email, profile & password management, httpOnly-cookie JWT sessions.
- **Projects** — website URL, default browsers, parallelism, retry policy, **environments** (dev/staging/prod with `{{VARIABLES}}`), team members with Owner/Editor/Viewer roles.
- **Test suites** — categories (Authentication, Navigation, Forms, Shopping cart, Checkout, API testing, …), enable/disable, run individually or all together.
- **Test cases** — name, description, target URL, steps, expected result, priority, timeout, enabled flag. Built from **11 predefined templates**: page load, link navigation, login, rejected login, form validation, element interaction, add to cart, checkout, search, visual regression, API request — plus a **custom steps** editor.
- **Execution engine** — isolated browser context per test, parallel execution, cross-browser runs, per-test timeouts, retries with **flaky detection**, browser-crash recovery and guaranteed process cleanup.
- **Results** — live progress, pass/fail/skip counts, durations, error messages and stack traces, browser + version, **failure screenshots**, execution logs, browser console errors, failed network requests, performance metrics.
- **Dashboard** — tests executed, passed/failed/skipped, success rate, average duration, daily trend, results by project, recent runs.
- **History & reporting** — filter by project/status/trigger/date, individual test reports, **compare two runs** (regressed/fixed), **insights**: flaky tests, recurring failures, common errors, slowest tests.
- **Automation** — cron **schedules** (BullMQ job schedulers), **CI/CD trigger API** with project API keys (GitHub Actions example included), **email & Slack** notifications on failures.
- **Visual regression** — baseline on first run, pixel diff with tolerance, approve new baselines from the report.
- **AI failure analysis** — summary, likely causes and next steps via the Anthropic API; rule-based fallback when no key is set.

## Quick start (development)

Prerequisites: Node 22+, Docker.

```bash
npm install
npx playwright install chromium firefox webkit   # browsers for the engine
npm run infra:up                                  # Postgres :5440 and Redis :6390 via docker compose
cp backend/.env.example backend/.env              # set JWT_SECRET
cd backend && npx prisma migrate deploy && npm run db:seed && cd ..

# three terminals
npm run dev:api      # http://localhost:4100
npm run dev:worker   # executes queued test runs
npm run dev:web      # http://localhost:5173
```

Sign in with the seeded account **demo@qa.local / Demo1234**. The *Demo Shop* project tests a small
website bundled with the API at `http://localhost:4100/demo/` (login, forms, cart, checkout, a page with
console errors) so every template can be tried immediately — one Smoke test fails on purpose to show
failure reports.

Emails (password reset, failure alerts) are printed to the API log until `SMTP_URL` is set.
Set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` to switch failure analysis from rule-based to an LLM.

## Tests

```bash
docker compose exec postgres psql -U qa -d qa_platform -c "CREATE DATABASE qa_platform_test"  # once
npm test            # backend: unit, engine, execution & API tests (Vitest + Supertest)
npm run test:e2e    # Playwright E2E of the platform itself (needs api, worker and web running)
```

| Suite | Covers |
|---|---|
| `backend/test/unit.test.ts` | interpolation, templates, visual diff, error grouping, heuristics, cron |
| `backend/test/engine.test.ts` | real browser runs: navigation, login, forms, **screenshot generation**, missing elements, **timeouts**, unreachable sites, **browser crash recovery**, Firefox/WebKit, visual baselines, API tests, process cleanup |
| `backend/test/execution.test.ts` | full runs against the DB: **result accuracy**, **parallel execution**, **concurrent runs**, retries & flaky detection, recurring failures, run comparison, cancellation |
| `backend/test/api.test.ts` | auth, password recovery, profile, projects, suites, cases, roles, schedules, CI keys, history filters |
| `e2e/tests/*.spec.ts` | user journeys in the browser: auth, create project → suite → case → run → report, failure screenshot + analysis, disabling cases, custom steps, history filter + comparison, mobile layout |

## Deployment

The `Dockerfile` builds one image (Playwright base image with all three browsers) that runs either the
API — which also serves the built React app — or a worker.

```bash
cp .env.production.example .env.production       # set JWT_SECRET, APP_URL, SMTP_URL, …
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --scale worker=3   # more parallel capacity
```

Migrations run automatically on API start. Screenshots live in the `artifacts` volume shared by API and
workers. For a single-container host (Render, Railway, Fly.io, …) run the image with `EMBEDDED_WORKER=true`
and attach managed Postgres + Redis via `DATABASE_URL` / `REDIS_URL`. Serving over plain HTTP requires
`COOKIE_SECURE=false`.

CI (`.github/workflows/ci.yml`) typechecks, builds, runs the backend suites and the Playwright E2E suite
against a live stack, and uploads the HTML report.

## Project layout

```
backend/
  prisma/            schema, migrations, seed
  src/engine/        Playwright engine: browser pool, executor, steps & assertions, templates, visual diff
  src/services/      run creation & execution, insights, notifications, AI analysis, mail
  src/routes/        auth, projects (envs, members, schedules, API keys), suites & cases, runs & reports, CI
  src/worker.ts      BullMQ worker + scheduler restore
  demo-site/         sample website for trying templates
  test/              Vitest suites + fixture server
frontend/src/
  store/             Redux store, RTK Query API, auth & UI slices
  pages/             dashboard, projects, suites, case editor, runs, reports, compare, profile, auth
  components/        layout, charts, tables, dialogs, UI primitives
e2e/                 Playwright tests for the platform
docs/                ARCHITECTURE.md (execution architecture), API.md (endpoints)
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/API.md](docs/API.md)
