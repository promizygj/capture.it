import { expect, type Page } from '@playwright/test';

export const DEMO_URL = process.env.E2E_DEMO_URL ?? 'http://localhost:4100';
export const PASSWORD = 'E2eSecret123';
export const uniqueEmail = (prefix = 'e2e') => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.test`;

export async function register(page: Page, name = 'E2E Tester') {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/projects\/new/);
  return email;
}

export async function createProject(page: Page, name: string) {
  await page.goto('/projects/new');
  await page.getByLabel('Project name').fill(name);
  await page.getByLabel('Website URL').fill(DEMO_URL);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
  return page.url().split('/projects/')[1].split('?')[0];
}

export async function createSuite(page: Page, name: string, category = 'Navigation') {
  await page.getByTestId('new-suite').click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Category', { exact: true }).fill(category);
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await expect(page.getByRole('heading', { name })).toBeVisible();
}

export async function addPageLoadCase(page: Page, name: string, url: string, opts: { title?: string; text?: string } = {}) {
  await page.getByTestId('new-case').first().click();
  await page.getByTestId('template-page-load').click();
  await page.getByLabel('Test case name *').fill(name);
  await page.getByLabel('Target URL *').fill(url);
  if (opts.title) await page.getByLabel('Title contains').fill(opts.title);
  if (opts.text) await page.getByLabel('Page text contains').fill(opts.text);
  await page.getByTestId('save-case').click();
  await expect(page.getByTestId('case-row').filter({ hasText: name })).toBeVisible();
}

export async function runSuiteAndWait(page: Page) {
  await page.getByTestId('run-suite').click();
  await page.getByTestId('confirm-run').click();
  await expect(page).toHaveURL(/\/runs\//);
  // Wait for the live progress to finish
  await expect(page.getByText(/^(Passed|Failed|Error)$/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('run-progress')).toHaveCount(0, { timeout: 60_000 });
}
