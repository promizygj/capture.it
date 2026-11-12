import http from 'node:http';
import path from 'node:path';
import express from 'express';
import type { AddressInfo } from 'node:net';

/** Serves the demo site plus a few pages that exercise edge cases (slow, flaky, API). */
export async function startFixtureServer() {
  const app = express();
  let flakyHits = 0;
  app.use('/demo', express.static(path.resolve('demo-site'), { extensions: ['html'] }));
  app.get('/demo/api/broken', (_req, res) => res.status(500).json({ error: 'boom' }));
  app.get('/slow', (_req, res) => setTimeout(() => res.send('<h1>finally</h1>'), 5000));
  app.get('/wait', (req, res) => setTimeout(() => res.send(`<title>Wait</title><h1 id="ok">waited</h1>`), Number(req.query.ms ?? 1000)));
  // Fails on every odd request, passes on even ones – deterministic flakiness
  app.get('/flaky', (_req, res) => {
    flakyHits++;
    res.send(flakyHits % 2 === 1 ? '<h1>broken</h1>' : '<h1 id="ok">works</h1>');
  });
  app.get('/api/items', (_req, res) => res.json({ status: 'ok', items: [{ id: 7, name: 'Widget' }] }));
  app.post('/api/echo', express.json(), (req, res) => res.status(201).json({ received: req.body, auth: req.header('authorization') ?? null }));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, close: () => new Promise<void>((r) => server.close(() => r())), resetFlaky: () => (flakyHits = 0) };
}
