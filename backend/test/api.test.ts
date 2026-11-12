import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/queue.js', () => ({ enqueueRun: vi.fn(async () => undefined), syncSchedule: vi.fn(async () => undefined), removeSchedule: vi.fn(async () => undefined) }));
vi.mock('../src/services/mail.js', () => ({ sendMail: vi.fn(async () => undefined) }));

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/lib/prisma.js');
const { sendMail } = await import('../src/services/mail.js');
const app = createApp();

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
async function signup(name = 'Tester') {
  const agent = request.agent(app);
  const email = `u${uniq()}@t.test`;
  const res = await agent.post('/api/auth/register').send({ name, email, password: 'Secret123' });
  expect(res.status).toBe(201);
  return { agent, email, user: res.body.user };
}

afterAll(() => prisma.$disconnect());

describe('authentication', () => {
  it('registers, reads the session, logs out and logs back in', async () => {
    const { agent, email } = await signup();
    expect((await agent.get('/api/auth/me')).body.user.email).toBe(email);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ email, password: 'wrong-pass1' })).status).toBe(401);
    expect((await agent.post('/api/auth/login').send({ email, password: 'Secret123' })).status).toBe(200);
  });

  it('validates input and rejects duplicate accounts', async () => {
    const weak = await request(app).post('/api/auth/register').send({ name: 'x', email: 'x@t.test', password: 'short' });
    expect(weak.status).toBe(400);
    const { email } = await signup();
    expect((await request(app).post('/api/auth/register').send({ name: 'y', email, password: 'Secret123' })).status).toBe(409);
  });

  it('sets an httpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'c', email: `c${uniq()}@t.test`, password: 'Secret123' });
    expect(res.headers['set-cookie'][0]).toMatch(/qa_token=.*HttpOnly/i);
  });

  it('recovers a password with a single-use token and invalidates old sessions', async () => {
    const { agent, email } = await signup();
    vi.mocked(sendMail).mockClear();
    const res = await request(app).post('/api/auth/forgot-password').send({ email });
    expect(res.status).toBe(200);
    const text = vi.mocked(sendMail).mock.calls[0][2];
    const token = /token=([\w-]+)/.exec(text)![1];
    // Unknown emails get the same response (no account enumeration)
    expect((await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@t.test' })).body).toEqual(res.body);

    await new Promise((r) => setTimeout(r, 1100));
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'NewSecret1' })).status).toBe(200);
    expect((await request(app).post('/api/auth/reset-password').send({ token, password: 'Another1x' })).status).toBe(400);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ email, password: 'NewSecret1' })).status).toBe(200);
  });

  it('updates the profile and changes the password', async () => {
    const { agent } = await signup();
    expect((await agent.patch('/api/auth/me').send({ name: 'Renamed' })).body.user.name).toBe('Renamed');
    expect((await agent.post('/api/auth/me/password').send({ currentPassword: 'nope', newPassword: 'Changed123' })).status).toBe(400);
    expect((await agent.post('/api/auth/me/password').send({ currentPassword: 'Secret123', newPassword: 'Changed123' })).status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('requires authentication for protected routes', async () => {
    expect((await request(app).get('/api/projects')).status).toBe(401);
  });
});

describe('projects, suites and test cases', () => {
  let owner: Awaited<ReturnType<typeof signup>>;
  let projectId: string;
  let suiteId: string;

  beforeAll(async () => {
    owner = await signup('Owner');
  });

  it('creates, lists, updates a project with a default environment', async () => {
    const res = await owner.agent.post('/api/projects').send({ name: 'Shop', baseUrl: 'https://shop.test', environments: [{ name: 'Staging', baseUrl: 'https://staging.shop.test' }] });
    expect(res.status).toBe(201);
    projectId = res.body.project.id;
    const detail = (await owner.agent.get(`/api/projects/${projectId}`)).body.project;
    expect(detail.environments).toHaveLength(1);
    expect(detail.environments[0]).toMatchObject({ name: 'Staging', isDefault: true });
    expect(detail.role).toBe('OWNER');
    expect((await owner.agent.patch(`/api/projects/${projectId}`).send({ name: 'Shop 2', retries: 2 })).body.project).toMatchObject({ name: 'Shop 2', retries: 2 });
    expect((await owner.agent.get('/api/projects?q=shop 2')).body.projects).toHaveLength(1);
    expect((await owner.agent.post('/api/projects').send({ name: 'Bad', baseUrl: 'not a url' })).status).toBe(400);
  });

  it('manages suites and template-based test cases', async () => {
    const s = await owner.agent.post(`/api/projects/${projectId}/suites`).send({ name: 'Auth', category: 'Authentication' });
    expect(s.status).toBe(201);
    suiteId = s.body.suite.id;

    const missing = await owner.agent.post(`/api/suites/${suiteId}/cases`).send({ name: 'Login', template: 'login', targetUrl: '/login', config: { username: 'a' } });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/Missing required/);

    const c = await owner.agent.post(`/api/suites/${suiteId}/cases`).send({
      name: 'Login', template: 'login', targetUrl: '/login', priority: 'HIGH', timeoutMs: 20000,
      config: { usernameSelector: '#u', passwordSelector: '#p', submitSelector: 'button', username: 'me', password: 'pw', successUrl: '/home' },
    });
    expect(c.status).toBe(201);
    expect(c.body.testCase.steps).toHaveLength(3);
    expect(c.body.testCase.expectedResult).toBeTruthy();

    const custom = await owner.agent.post(`/api/suites/${suiteId}/cases`).send({ name: 'Custom', template: 'custom-steps', steps: [{ action: 'click' }], expectations: [] });
    expect(custom.status).toBe(400); // click needs a selector

    const id = c.body.testCase.id;
    expect((await owner.agent.patch(`/api/cases/${id}`).send({ enabled: false })).body.testCase.enabled).toBe(false);
    expect((await owner.agent.patch(`/api/cases/${id}`).send({ config: { ...c.body.testCase.config, successUrl: '/dash' } })).body.testCase.expectations[0].value).toBe('/dash');
    expect((await owner.agent.post(`/api/cases/${id}/duplicate`)).body.testCase.name).toBe('Login (copy)');
    expect((await owner.agent.get(`/api/suites/${suiteId}`)).body.suite.cases).toHaveLength(2);
    expect((await owner.agent.patch(`/api/suites/${suiteId}`).send({ enabled: false })).body.suite.enabled).toBe(false);
    expect((await owner.agent.post(`/api/projects/${projectId}/runs`).send({ suiteId })).status).toBe(400);
  });

  it('enforces project roles for team members', async () => {
    const viewer = await signup('Viewer');
    const stranger = await signup('Stranger');
    expect((await stranger.agent.get(`/api/projects/${projectId}`)).status).toBe(404);
    expect((await owner.agent.post(`/api/projects/${projectId}/members`).send({ email: viewer.email, role: 'VIEWER' })).status).toBe(201);
    expect((await viewer.agent.get(`/api/projects/${projectId}`)).status).toBe(200);
    expect((await viewer.agent.post(`/api/projects/${projectId}/suites`).send({ name: 'Nope' })).status).toBe(403);
    expect((await viewer.agent.delete(`/api/projects/${projectId}`)).status).toBe(403);
    const members = (await owner.agent.get(`/api/projects/${projectId}/members`)).body.members;
    const ownerMember = members.find((m: { role: string }) => m.role === 'OWNER');
    expect((await owner.agent.patch(`/api/projects/${projectId}/members/${ownerMember.id}`).send({ role: 'VIEWER' })).status).toBe(400);
  });

  it('creates schedules with validated cron expressions', async () => {
    expect((await owner.agent.post(`/api/projects/${projectId}/schedules`).send({ name: 'bad', cron: '61 * * * *' })).status).toBe(400);
    const ok = await owner.agent.post(`/api/projects/${projectId}/schedules`).send({ name: 'Nightly', cron: '0 2 * * *', timezone: 'Europe/Paris' });
    expect(ok.status).toBe(201);
    const list = (await owner.agent.get(`/api/projects/${projectId}/schedules`)).body.schedules;
    expect(new Date(list[0].nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('triggers runs from CI with a project API key', async () => {
    await owner.agent.patch(`/api/suites/${suiteId}`).send({ enabled: true });
    const cases = (await owner.agent.get(`/api/suites/${suiteId}`)).body.suite.cases;
    await owner.agent.patch(`/api/cases/${cases[0].id}`).send({ enabled: true });
    await owner.agent.post(`/api/projects/${projectId}/suites`).send({ name: 'Smoke' });
    const { key } = (await owner.agent.post(`/api/projects/${projectId}/api-keys`).send({ name: 'CI' })).body;
    expect(key).toMatch(/^qa_/);
    expect((await request(app).post('/api/ci/runs').send({})).status).toBe(401);
    expect((await request(app).post('/api/ci/runs').set('X-API-Key', 'qa_wrong').send({})).status).toBe(401);
    const run = await request(app).post('/api/ci/runs').set('X-API-Key', key).send({ suite: 'auth', environment: 'staging', metadata: { commit: 'abc' } });
    expect(run.status).toBe(201);
    const status = await request(app).get(`/api/ci/runs/${run.body.runId}`).set('X-API-Key', key);
    expect(status.body).toMatchObject({ status: 'QUEUED', done: false, total: 2, skipped: 1 });
    // Keys only work for their own project
    const other = await signup();
    const otherProject = (await other.agent.post('/api/projects').send({ name: 'O', baseUrl: 'https://o.test' })).body.project.id;
    const otherKey = (await other.agent.post(`/api/projects/${otherProject}/api-keys`).send({ name: 'k' })).body.key;
    expect((await request(app).get(`/api/ci/runs/${run.body.runId}`).set('X-API-Key', otherKey)).status).toBe(404);
  });

  it('lists and filters execution history', async () => {
    const all = (await owner.agent.get('/api/runs')).body;
    expect(all.total).toBeGreaterThan(0);
    expect((await owner.agent.get('/api/runs?status=PASSED')).body.total).toBe(0);
    expect((await owner.agent.get('/api/runs?from=2000-01-01&to=2000-01-02')).body.total).toBe(0);
    expect((await owner.agent.get('/api/dashboard?days=7')).body.totals).toBeDefined();
  });

  it('deletes a project (owner only)', async () => {
    expect((await owner.agent.delete(`/api/projects/${projectId}`)).status).toBe(204);
    expect((await owner.agent.get(`/api/projects/${projectId}`)).status).toBe(404);
  });
});
