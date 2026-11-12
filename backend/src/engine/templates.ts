import type { Expectation, Step } from './types.js';

export type FieldType = 'text' | 'password' | 'number' | 'textarea' | 'select' | 'boolean' | 'pairs' | 'keyvalue';

export interface TemplateField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  default?: unknown;
  options?: string[];
}

export interface TestTemplate {
  key: string;
  name: string;
  category: string;
  description: string;
  kind: 'browser' | 'api';
  /** When true, steps/expectations are edited directly instead of generated */
  editableSteps?: boolean;
  fields: TemplateField[];
  defaults: { targetUrl: string; expectedResult: string };
  build: (cfg: Record<string, unknown>) => { steps: Step[]; expectations: Expectation[] };
}

const s = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** Parses lines of "selector => value" into pairs (used by form templates). */
export function parsePairs(v: unknown): { selector: string; value: string }[] {
  if (Array.isArray(v)) return v as { selector: string; value: string }[];
  return s(v)
    .split('\n')
    .map((line) => line.split('=>'))
    .filter((p) => p.length >= 2 && p[0].trim())
    .map(([sel, ...rest]) => ({ selector: sel.trim(), value: rest.join('=>').trim() }));
}

export const templates: TestTemplate[] = [
  {
    key: 'page-load',
    name: 'Page load & content check',
    category: 'Navigation',
    kind: 'browser',
    description: 'Opens a page, verifies it responds successfully and optionally checks title, text, key elements and load time.',
    defaults: { targetUrl: '/', expectedResult: 'Page loads with HTTP < 400 and expected content is visible.' },
    fields: [
      { name: 'expectedTitle', label: 'Title contains', type: 'text', placeholder: 'My Shop' },
      { name: 'expectedText', label: 'Page text contains', type: 'text', placeholder: 'Welcome' },
      { name: 'requiredSelector', label: 'Required element (CSS selector)', type: 'text', placeholder: 'header nav' },
      { name: 'maxLoadMs', label: 'Max load time (ms)', type: 'number', placeholder: '3000' },
      { name: 'failOnConsoleErrors', label: 'Fail on browser console errors', type: 'boolean', default: false },
    ],
    build: (c) => {
      const e: Expectation[] = [{ type: 'statusBelow', value: '400' }];
      if (s(c.expectedTitle)) e.push({ type: 'titleContains', value: s(c.expectedTitle) });
      if (s(c.expectedText)) e.push({ type: 'textContains', value: s(c.expectedText) });
      if (s(c.requiredSelector)) e.push({ type: 'visible', selector: s(c.requiredSelector) });
      if (s(c.maxLoadMs)) e.push({ type: 'loadTimeBelow', value: s(c.maxLoadMs) });
      if (c.failOnConsoleErrors === true || c.failOnConsoleErrors === 'true') e.push({ type: 'noConsoleErrors' });
      return { steps: [], expectations: e };
    },
  },
  {
    key: 'navigation-link',
    name: 'Link navigation',
    category: 'Navigation',
    kind: 'browser',
    description: 'Clicks a link or menu item and verifies the browser lands on the expected page.',
    defaults: { targetUrl: '/', expectedResult: 'Clicking the link navigates to the expected URL.' },
    fields: [
      { name: 'linkSelector', label: 'Link selector', type: 'text', required: true, placeholder: 'a[href="/about"] or text=About' },
      { name: 'expectedUrl', label: 'Destination URL contains', type: 'text', required: true, placeholder: '/about' },
      { name: 'expectedSelector', label: 'Element visible on destination', type: 'text', placeholder: 'h1' },
      { name: 'expectedText', label: 'Destination text contains', type: 'text' },
    ],
    build: (c) => {
      const e: Expectation[] = [{ type: 'urlContains', value: s(c.expectedUrl) }];
      if (s(c.expectedSelector)) e.push({ type: 'visible', selector: s(c.expectedSelector) });
      if (s(c.expectedText)) e.push({ type: 'textContains', value: s(c.expectedText) });
      return { steps: [{ action: 'click', selector: s(c.linkSelector) }], expectations: e };
    },
  },
  {
    key: 'login',
    name: 'Login (valid credentials)',
    category: 'Authentication',
    kind: 'browser',
    description: 'Fills a login form with valid credentials and verifies the user is signed in. Use {{VARIABLE}} to pull secrets from the environment.',
    defaults: { targetUrl: '/login', expectedResult: 'User is authenticated and redirected to the signed-in area.' },
    fields: [
      { name: 'usernameSelector', label: 'Username/email field', type: 'text', required: true, default: '#email' },
      { name: 'passwordSelector', label: 'Password field', type: 'text', required: true, default: '#password' },
      { name: 'submitSelector', label: 'Submit button', type: 'text', required: true, default: 'button[type=submit]' },
      { name: 'username', label: 'Username / email', type: 'text', required: true, placeholder: '{{USERNAME}}' },
      { name: 'password', label: 'Password', type: 'password', required: true, placeholder: '{{PASSWORD}}' },
      { name: 'successUrl', label: 'URL after login contains', type: 'text', placeholder: '/dashboard' },
      { name: 'successSelector', label: 'Element visible after login', type: 'text', placeholder: '.user-menu' },
    ],
    build: (c) => {
      const e: Expectation[] = [];
      if (s(c.successUrl)) e.push({ type: 'urlContains', value: s(c.successUrl) });
      if (s(c.successSelector)) e.push({ type: 'visible', selector: s(c.successSelector) });
      if (!e.length) e.push({ type: 'hidden', selector: s(c.passwordSelector) });
      return {
        steps: [
          { action: 'fill', selector: s(c.usernameSelector), value: s(c.username) },
          { action: 'fill', selector: s(c.passwordSelector), value: s(c.password) },
          { action: 'click', selector: s(c.submitSelector) },
        ],
        expectations: e,
      };
    },
  },
  {
    key: 'invalid-login',
    name: 'Login rejected (invalid credentials)',
    category: 'Authentication',
    kind: 'browser',
    description: 'Submits wrong credentials and verifies an error message is shown and the user stays signed out.',
    defaults: { targetUrl: '/login', expectedResult: 'An error message is displayed and access is denied.' },
    fields: [
      { name: 'usernameSelector', label: 'Username/email field', type: 'text', required: true, default: '#email' },
      { name: 'passwordSelector', label: 'Password field', type: 'text', required: true, default: '#password' },
      { name: 'submitSelector', label: 'Submit button', type: 'text', required: true, default: 'button[type=submit]' },
      { name: 'username', label: 'Username / email', type: 'text', default: 'wrong@example.com' },
      { name: 'password', label: 'Password', type: 'password', default: 'wrong-password' },
      { name: 'errorSelector', label: 'Error message element', type: 'text', required: true, placeholder: '.error' },
      { name: 'errorText', label: 'Error text contains', type: 'text', placeholder: 'Invalid' },
    ],
    build: (c) => {
      const e: Expectation[] = [{ type: 'visible', selector: s(c.errorSelector) }];
      if (s(c.errorText)) e.push({ type: 'textContains', selector: s(c.errorSelector), value: s(c.errorText) });
      e.push({ type: 'visible', selector: s(c.passwordSelector) });
      return {
        steps: [
          { action: 'fill', selector: s(c.usernameSelector), value: s(c.username) },
          { action: 'fill', selector: s(c.passwordSelector), value: s(c.password) },
          { action: 'click', selector: s(c.submitSelector) },
        ],
        expectations: e,
      };
    },
  },
  {
    key: 'form-validation',
    name: 'Form submission & validation',
    category: 'Forms',
    kind: 'browser',
    description: 'Fills form fields, submits, and checks for a success or validation message. Leave fields empty to test required-field validation.',
    defaults: { targetUrl: '/contact', expectedResult: 'Form shows the expected confirmation or validation message.' },
    fields: [
      { name: 'fields', label: 'Fields (one per line: selector => value)', type: 'pairs', placeholder: '#name => Jane Doe\n#email => jane@example.com' },
      { name: 'submitSelector', label: 'Submit button', type: 'text', required: true, default: 'button[type=submit]' },
      { name: 'resultSelector', label: 'Result / message element', type: 'text', required: true, placeholder: '.alert' },
      { name: 'resultText', label: 'Message contains', type: 'text', placeholder: 'Thank you' },
    ],
    build: (c) => {
      const steps: Step[] = parsePairs(c.fields).map((p) => ({ action: 'fill', selector: p.selector, value: p.value }));
      steps.push({ action: 'click', selector: s(c.submitSelector) });
      const e: Expectation[] = [{ type: 'visible', selector: s(c.resultSelector) }];
      if (s(c.resultText)) e.push({ type: 'textContains', selector: s(c.resultSelector), value: s(c.resultText) });
      return { steps, expectations: e };
    },
  },
  {
    key: 'element-interaction',
    name: 'Element interaction',
    category: 'UI',
    kind: 'browser',
    description: 'Performs a single interaction (click, hover, check, select, type) and verifies the resulting UI state.',
    defaults: { targetUrl: '/', expectedResult: 'The UI reacts to the interaction as expected.' },
    fields: [
      { name: 'action', label: 'Interaction', type: 'select', options: ['click', 'hover', 'check', 'uncheck', 'select', 'fill'], default: 'click' },
      { name: 'selector', label: 'Target element', type: 'text', required: true, placeholder: '#menu-toggle' },
      { name: 'value', label: 'Value (for select / fill)', type: 'text' },
      { name: 'expectedSelector', label: 'Element that should become visible', type: 'text', placeholder: '#menu' },
      { name: 'expectedText', label: 'Expected text in that element', type: 'text' },
    ],
    build: (c) => {
      const e: Expectation[] = [];
      if (s(c.expectedSelector)) e.push({ type: 'visible', selector: s(c.expectedSelector) });
      if (s(c.expectedSelector) && s(c.expectedText)) e.push({ type: 'textContains', selector: s(c.expectedSelector), value: s(c.expectedText) });
      return { steps: [{ action: (s(c.action) || 'click') as Step['action'], selector: s(c.selector), value: s(c.value) || undefined }], expectations: e };
    },
  },
  {
    key: 'add-to-cart',
    name: 'Add product to cart',
    category: 'Shopping cart',
    kind: 'browser',
    description: 'Adds a product to the cart and verifies the cart counter / contents update.',
    defaults: { targetUrl: '/products', expectedResult: 'Cart count increases and the product appears in the cart.' },
    fields: [
      { name: 'addButtonSelector', label: '"Add to cart" button', type: 'text', required: true, placeholder: '[data-testid=add-to-cart]' },
      { name: 'cartCountSelector', label: 'Cart count element', type: 'text', required: true, placeholder: '#cart-count' },
      { name: 'expectedCount', label: 'Expected count after adding', type: 'text', default: '1' },
      { name: 'cartItemText', label: 'Page shows text after adding', type: 'text' },
    ],
    build: (c) => {
      const steps: Step[] = [{ action: 'click', selector: s(c.addButtonSelector) }];
      const e: Expectation[] = [{ type: 'textEquals', selector: s(c.cartCountSelector), value: s(c.expectedCount) || '1' }];
      if (s(c.cartItemText)) e.push({ type: 'textContains', value: s(c.cartItemText) });
      return { steps, expectations: e };
    },
  },
  {
    key: 'checkout',
    name: 'Checkout flow',
    category: 'Checkout',
    kind: 'browser',
    description: 'Fills the checkout form, places the order and verifies the confirmation.',
    defaults: { targetUrl: '/checkout', expectedResult: 'Order is placed and a confirmation is displayed.' },
    fields: [
      { name: 'preSteps', label: 'Buttons to click first (one selector per line, e.g. add to cart)', type: 'textarea' },
      { name: 'fields', label: 'Checkout fields (selector => value)', type: 'pairs', placeholder: '#address => 1 Main St\n#card => 4242424242424242' },
      { name: 'submitSelector', label: 'Place order button', type: 'text', required: true, placeholder: '#place-order' },
      { name: 'confirmationSelector', label: 'Confirmation element', type: 'text', required: true, placeholder: '.order-confirmation' },
      { name: 'confirmationText', label: 'Confirmation text contains', type: 'text', placeholder: 'Thank you for your order' },
    ],
    build: (c) => {
      const steps: Step[] = s(c.preSteps)
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((sel) => ({ action: 'click', selector: sel }));
      steps.push(...parsePairs(c.fields).map((p) => ({ action: 'fill' as const, selector: p.selector, value: p.value })));
      steps.push({ action: 'click', selector: s(c.submitSelector) });
      const e: Expectation[] = [{ type: 'visible', selector: s(c.confirmationSelector) }];
      if (s(c.confirmationText)) e.push({ type: 'textContains', selector: s(c.confirmationSelector), value: s(c.confirmationText) });
      return { steps, expectations: e };
    },
  },
  {
    key: 'search',
    name: 'Search returns results',
    category: 'Navigation',
    kind: 'browser',
    description: 'Types a query into a search box and verifies results are listed.',
    defaults: { targetUrl: '/', expectedResult: 'Search results matching the query are displayed.' },
    fields: [
      { name: 'inputSelector', label: 'Search input', type: 'text', required: true, placeholder: 'input[type=search]' },
      { name: 'query', label: 'Query', type: 'text', required: true },
      { name: 'resultSelector', label: 'Result item selector', type: 'text', required: true, placeholder: '.result' },
      { name: 'expectedText', label: 'Results contain text', type: 'text' },
    ],
    build: (c) => {
      const e: Expectation[] = [{ type: 'visible', selector: s(c.resultSelector) }];
      if (s(c.expectedText)) e.push({ type: 'textContains', value: s(c.expectedText) });
      return {
        steps: [
          { action: 'fill', selector: s(c.inputSelector), value: s(c.query) },
          { action: 'press', selector: s(c.inputSelector), value: 'Enter' },
        ],
        expectations: e,
      };
    },
  },
  {
    key: 'visual-regression',
    name: 'Visual regression snapshot',
    category: 'Visual',
    kind: 'browser',
    description: 'Screenshots the page and compares it pixel-by-pixel with the stored baseline. The first run records the baseline.',
    defaults: { targetUrl: '/', expectedResult: 'Page matches the approved baseline within tolerance.' },
    fields: [
      { name: 'fullPage', label: 'Capture full page', type: 'boolean', default: true },
      { name: 'maxDiffRatio', label: 'Max differing pixels (0–1)', type: 'number', default: 0.01 },
      { name: 'threshold', label: 'Per-pixel colour threshold (0–1)', type: 'number', default: 0.1 },
      { name: 'maskSelectors', label: 'Dynamic regions to mask (one selector per line)', type: 'textarea', placeholder: '.timestamp\n.ad-banner' },
    ],
    build: () => ({ steps: [], expectations: [] }),
  },
  {
    key: 'api-request',
    name: 'API request',
    category: 'API testing',
    kind: 'api',
    description: 'Sends an HTTP request and validates status code, response time, body text and JSON fields.',
    defaults: { targetUrl: '/api/health', expectedResult: 'API responds with the expected status and payload.' },
    fields: [
      { name: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], default: 'GET' },
      { name: 'headers', label: 'Headers (one per line: Name => value)', type: 'keyvalue', placeholder: 'Authorization => Bearer {{API_TOKEN}}' },
      { name: 'body', label: 'Request body', type: 'textarea', placeholder: '{"name":"test"}' },
      { name: 'expectedStatus', label: 'Expected status', type: 'number', default: 200 },
      { name: 'maxResponseTimeMs', label: 'Max response time (ms)', type: 'number' },
      { name: 'bodyContains', label: 'Body contains', type: 'text' },
      { name: 'jsonAssertions', label: 'JSON assertions (path => expected)', type: 'pairs', placeholder: 'status => ok\ndata.items[0].id => 1' },
    ],
    build: () => ({ steps: [], expectations: [] }),
  },
  {
    key: 'custom-steps',
    name: 'Custom steps',
    category: 'Custom',
    kind: 'browser',
    editableSteps: true,
    description: 'Compose your own sequence of browser actions and assertions.',
    defaults: { targetUrl: '/', expectedResult: '' },
    fields: [],
    build: () => ({ steps: [], expectations: [] }),
  },
];

export const templateMap = new Map(templates.map((t) => [t.key, t]));

/** Normalises the stored config into the shape executors expect (e.g. "pairs" text → arrays). */
export function normaliseConfig(templateKey: string, cfg: Record<string, unknown>): Record<string, unknown> {
  const out = { ...cfg };
  if (templateKey === 'api-request') {
    if (typeof out.headers === 'string') {
      out.headers = Object.fromEntries(parsePairs(out.headers).map((p) => [p.selector, p.value]));
    }
    if (typeof out.jsonAssertions === 'string') {
      out.jsonAssertions = parsePairs(out.jsonAssertions).map((p) => ({ path: p.selector, equals: p.value }));
    }
    if (out.expectedStatus !== undefined && out.expectedStatus !== '') out.expectedStatus = Number(out.expectedStatus);
    if (out.maxResponseTimeMs !== undefined && out.maxResponseTimeMs !== '') out.maxResponseTimeMs = Number(out.maxResponseTimeMs) || undefined;
  }
  if (templateKey === 'visual-regression') {
    if (typeof out.maskSelectors === 'string') out.maskSelectors = out.maskSelectors.split('\n').map((l) => l.trim()).filter(Boolean);
    if (out.maxDiffRatio !== undefined) out.maxDiffRatio = Number(out.maxDiffRatio);
    if (out.threshold !== undefined) out.threshold = Number(out.threshold);
    if (typeof out.fullPage === 'string') out.fullPage = out.fullPage === 'true';
  }
  return out;
}

/** Public, serialisable description (no build fn) */
export const publicTemplates = templates.map(({ build: _b, ...t }) => t);
