# REST API

All endpoints are under `/api` and exchange JSON. Browser sessions authenticate with the `qa_token`
httpOnly cookie (or `Authorization: Bearer <jwt>`). CI endpoints use a project API key in `X-API-Key`.
Errors have the shape `{ "error": string, "details"?: object }`.

## Auth & profile
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | `{ name, email, password }` → creates account, signs in |
| POST | `/auth/login` | `{ email, password }` |
| POST | `/auth/logout` | Clears the session cookie |
| POST | `/auth/forgot-password` | `{ email }` → emails a reset link (always 200) |
| POST | `/auth/reset-password` | `{ token, password }` |
| GET | `/auth/me` | Current user |
| PATCH | `/auth/me` | `{ name?, email? }` |
| POST | `/auth/me/password` | `{ currentPassword, newPassword }` |

## Projects (role needed: V = viewer, E = editor, O = owner)
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/projects?q=` | — | Projects you belong to, with counts and last run |
| POST | `/projects` | — | `{ name, baseUrl, description?, defaultBrowsers?, maxParallel?, retries?, environments? }` |
| GET | `/projects/:id` | V | Project with environments and suites |
| PATCH | `/projects/:id` | E | Update settings, notifications (`notifyEmail`, `slackWebhookUrl`) |
| DELETE | `/projects/:id` | O | Delete project and all history |
| GET | `/projects/:id/insights?days=` | V | Flaky tests, recurring failures, common errors, slowest tests |
| POST/PATCH/DELETE | `/projects/:id/environments[/:envId]` | E | `{ name, baseUrl, variables, isDefault }` |
| GET/POST | `/projects/:id/members` | V / O | List / add `{ email, role }` |
| PATCH/DELETE | `/projects/:id/members/:memberId` | O (or self to leave) | Change role / remove |
| GET/POST | `/projects/:id/schedules` | V / E | `{ name, cron, timezone, suiteId?, environmentId?, browsers, enabled }` |
| PATCH/DELETE | `/projects/:id/schedules/:scheduleId` | E | |
| GET/POST | `/projects/:id/api-keys` | E | Create returns the plain key once |
| DELETE | `/projects/:id/api-keys/:keyId` | E | Revoke |

## Suites & test cases
| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/templates` | — | Templates, step actions, assertion types, suggested categories |
| POST | `/projects/:id/suites` | E | `{ name, category, description? }` |
| GET | `/suites/:id` | V | Suite with cases and each case's last result |
| PATCH/DELETE | `/suites/:id` | E | Update (incl. `enabled`) / delete |
| POST | `/suites/:id/cases` | E | `{ name, template, targetUrl, config, steps?, expectations?, priority, timeoutMs, enabled, expectedResult? }` |
| GET | `/cases/:id` | V | Case + recent executions + visual baselines |
| PATCH | `/cases/:id` | E | Partial update; `{ enabled }` alone toggles |
| POST | `/cases/:id/duplicate` | E | |
| DELETE | `/cases/:id` | E | |

## Runs & reports
| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/projects/:id/runs` | E | `{ suiteId?, environmentId?, browsers? }` → queued run |
| GET | `/runs` | — | Filters: `projectId, suiteId, status (comma list), trigger, from, to, page, pageSize` |
| GET | `/runs/:id` | V | Run with all results (live progress while running) |
| POST | `/runs/:id/cancel` | E | |
| POST | `/runs/:id/rerun` | E | Same suite / environment / browsers |
| DELETE | `/runs/:id` | E | Finished runs only |
| GET | `/runs/compare?base=&head=` | V | Per-test comparison |
| GET | `/results/:id` | V | Full report: logs, console errors, network failures, metrics, history |
| GET | `/results/:id/images/:kind` | V | `screenshot`, `current`, `baseline`, `diff` (PNG) |
| POST | `/results/:id/analyze?refresh=true` | V | Failure analysis (AI or rule-based) |
| POST | `/results/:id/approve-baseline` | E | Promote screenshot to visual baseline |
| GET | `/dashboard?projectId=&days=` | — | Totals, success rate, avg duration, daily trend, per-project stats, recent runs |

## CI/CD
| Method | Path | Description |
|---|---|---|
| POST | `/ci/runs` | `{ suite? \| suiteId?, environment?, browsers?, metadata? }` → `{ runId, statusUrl, reportUrl }` |
| GET | `/ci/runs/:id` | `{ status, done, success, total, passed, failed, skipped, flaky, failures[], reportUrl }` |

```bash
curl -X POST https://qa.example.com/api/ci/runs \
  -H "X-API-Key: $QA_PLATFORM_KEY" -H "content-type: application/json" \
  -d '{"suite":"Smoke","environment":"staging","metadata":{"commit":"'$GITHUB_SHA'"}}'
```
