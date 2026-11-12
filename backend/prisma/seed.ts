/* Seeds a demo user and a project that exercises every template against the built-in demo site. */
import bcrypt from 'bcryptjs';
import type { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import { templateMap } from '../src/engine/templates.js';

const API_URL = process.env.SEED_TARGET_URL ?? `http://localhost:${process.env.PORT ?? 4100}`;

type CaseSeed = { name: string; template: string; targetUrl: string; config?: Record<string, unknown>; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; timeoutMs?: number; description?: string };

function tc(c: CaseSeed, position: number): Prisma.TestCaseCreateWithoutSuiteInput {
  const tpl = templateMap.get(c.template)!;
  const config = c.config ?? {};
  const built = tpl.build(config);
  return {
    name: c.name,
    description: c.description,
    template: c.template,
    targetUrl: c.targetUrl,
    config: config as Prisma.InputJsonValue,
    steps: built.steps as unknown as Prisma.InputJsonValue,
    expectations: built.expectations as unknown as Prisma.InputJsonValue,
    expectedResult: tpl.defaults.expectedResult,
    priority: c.priority ?? 'MEDIUM',
    timeoutMs: c.timeoutMs ?? 30_000,
    position,
  };
}

const suites: { name: string; category: string; description: string; cases: CaseSeed[] }[] = [
  {
    name: 'Smoke',
    category: 'Navigation',
    description: 'Critical pages load and navigation works',
    cases: [
      { name: 'Home page loads', template: 'page-load', targetUrl: '/demo/', priority: 'CRITICAL', config: { expectedTitle: 'Demo Shop', requiredSelector: 'header', maxLoadMs: 5000 } },
      { name: 'Navigate to products', template: 'navigation-link', targetUrl: '/demo/', config: { linkSelector: 'header >> text=Products', expectedUrl: '/demo/products', expectedSelector: 'h1' } },
      { name: 'Search finds widgets', template: 'search', targetUrl: '/demo/', config: { inputSelector: 'input[type=search]', query: 'widget', resultSelector: '.result', expectedText: 'Blue Widget' } },
      { name: 'Broken page has no console errors', template: 'page-load', targetUrl: '/demo/broken', description: 'Intentionally failing example', config: { failOnConsoleErrors: true } },
    ],
  },
  {
    name: 'Authentication',
    category: 'Authentication',
    description: 'Sign-in flows',
    cases: [
      { name: 'Valid login', template: 'login', targetUrl: '/demo/login', priority: 'CRITICAL', config: { usernameSelector: '#email', passwordSelector: '#password', submitSelector: 'button[type=submit]', username: '{{USERNAME}}', password: '{{PASSWORD}}', successUrl: '/demo/account', successSelector: '.user-menu' } },
      { name: 'Invalid login shows error', template: 'invalid-login', targetUrl: '/demo/login', config: { usernameSelector: '#email', passwordSelector: '#password', submitSelector: 'button[type=submit]', username: 'wrong@example.com', password: 'nope', errorSelector: '#login-error', errorText: 'Invalid' } },
    ],
  },
  {
    name: 'Forms',
    category: 'Forms',
    description: 'Contact form validation',
    cases: [
      { name: 'Contact form requires fields', template: 'form-validation', targetUrl: '/demo/contact', config: { fields: '', submitSelector: 'button[type=submit]', resultSelector: '#alert', resultText: 'Name is required' } },
      { name: 'Contact form submits', template: 'form-validation', targetUrl: '/demo/contact', config: { fields: '#name => Jane Doe\n#email => jane@example.com\n#message => Hello, I have a question about widgets.', submitSelector: 'button[type=submit]', resultSelector: '#alert', resultText: 'Thank you' } },
    ],
  },
  {
    name: 'Shopping cart & checkout',
    category: 'Checkout',
    description: 'Cart and order placement',
    cases: [
      { name: 'Add product to cart', template: 'add-to-cart', targetUrl: '/demo/products', config: { addButtonSelector: '[data-testid=add-to-cart]', cartCountSelector: '#cart-count', expectedCount: '1', cartItemText: 'added to cart' } },
      { name: 'Checkout places order', template: 'checkout', targetUrl: '/demo/checkout', priority: 'HIGH', config: { preSteps: '#quick-add', fields: '#full-name => Jane Doe\n#address => 1 Main St\n#card => 4242424242424242', submitSelector: '#place-order', confirmationSelector: '.order-confirmation', confirmationText: 'Thank you for your order' } },
    ],
  },
  {
    name: 'API',
    category: 'API testing',
    description: 'Backend API contract checks',
    cases: [
      { name: 'Health endpoint', template: 'api-request', targetUrl: '/demo/api/health', config: { method: 'GET', expectedStatus: 200, maxResponseTimeMs: 2000, jsonAssertions: 'status => ok\nitems[0].name => Widget' } },
    ],
  },
  {
    name: 'Visual',
    category: 'Visual',
    description: 'Visual regression snapshots',
    cases: [{ name: 'Home page snapshot', template: 'visual-regression', targetUrl: '/demo/', config: { fullPage: true, maxDiffRatio: 0.01, threshold: 0.1 } }],
  },
];

async function main() {
  const email = 'demo@qa.local';
  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name: 'Demo QA Engineer', passwordHash: await bcrypt.hash('Demo1234', 12) },
  });
  const existing = await prisma.project.findFirst({ where: { name: 'Demo Shop', members: { some: { userId: user.id } } } });
  if (existing) {
    console.log('Demo project already exists – skipping');
    return;
  }
  await prisma.project.create({
    data: {
      name: 'Demo Shop',
      description: 'Example project testing the bundled demo website',
      baseUrl: API_URL,
      retries: 1,
      maxParallel: 3,
      members: { create: { userId: user.id, role: 'OWNER' } },
      environments: {
        create: [
          { name: 'Development', baseUrl: API_URL, isDefault: true, variables: { USERNAME: 'demo@example.com', PASSWORD: 'Password123' } },
          { name: 'Staging', baseUrl: API_URL, variables: { USERNAME: 'demo@example.com', PASSWORD: 'Password123' } },
        ],
      },
      suites: {
        create: suites.map((s, i) => ({ name: s.name, category: s.category, description: s.description, position: i, cases: { create: s.cases.map(tc) } })),
      },
    },
  });
  console.log(`Seeded demo user ${email} / Demo1234 and project "Demo Shop" → ${API_URL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
