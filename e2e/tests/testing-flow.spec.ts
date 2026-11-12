import { expect, test } from '@playwright/test';
import { addPageLoadCase, createProject, createSuite, register, runSuiteAndWait } from './helpers';

test.describe('configure and execute tests', () => {
  test('passing run: project → suite → template test case → run → report', async ({ page }) => {
    await register(page);
    await createProject(page, 'E2E Shop');
    await createSuite(page, 'Smoke');
    await addPageLoadCase(page, 'Home loads', '/demo/', { title: 'Demo Shop', text: 'Welcome' });
    await runSuiteAndWait(page);

    await expect(page.getByText('Passed').first()).toBeVisible();
    const row = page.getByTestId('result-row').filter({ hasText: 'Home loads' });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByRole('heading', { name: /Home loads/ })).toBeVisible();
    await expect(page.getByTestId('logs')).toContainText('Navigated to');
    await page.getByRole('tab', { name: 'Performance' }).click();
    await expect(page.getByText('Page load', { exact: true })).toBeVisible();
  });

  test('failing run shows error, screenshot and failure analysis', async ({ page }) => {
    await register(page);
    await createProject(page, 'E2E Failures');
    await createSuite(page, 'Content');
    await addPageLoadCase(page, 'Missing text', '/demo/', { text: 'this text is not on the page' });
    await runSuiteAndWait(page);

    await page.getByTestId('result-row').filter({ hasText: 'Missing text' }).click();
    await expect(page.getByTestId('error-message')).toContainText('this text is not on the page');
    const shot = page.getByTestId('screenshot');
    await expect(shot).toBeVisible();
    await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);

    await page.getByTestId('analyze').click();
    await expect(page.getByTestId('analysis')).toContainText('Likely causes');
  });

  test('disabling a test case skips it', async ({ page }) => {
    await register(page);
    await createProject(page, 'E2E Toggle');
    await createSuite(page, 'Mixed');
    await addPageLoadCase(page, 'Runs', '/demo/');
    await addPageLoadCase(page, 'Turned off', '/demo/contact');
    await page.getByTestId('case-row').filter({ hasText: 'Turned off' }).getByRole('switch').click();
    await expect(page.getByText('1 of 2 enabled')).toBeVisible();
    await runSuiteAndWait(page);
    await expect(page.getByRole('button', { name: 'Skipped (1)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Passed (1)' })).toBeVisible();
  });

  test('custom steps editor builds an interaction test', async ({ page }) => {
    await register(page);
    await createProject(page, 'E2E Custom');
    await createSuite(page, 'Cart', 'Shopping cart');
    await page.getByTestId('new-case').first().click();
    await page.getByTestId('template-custom-steps').click();
    await page.getByLabel('Test case name *').fill('Add to cart via custom steps');
    await page.getByLabel('Target URL *').fill('/demo/products');
    await page.getByLabel('Selector').first().fill('[data-testid=add-to-cart]');
    await page.getByLabel('Selector').nth(1).fill('#toast');
    await page.getByTestId('save-case').click();
    await expect(page.getByTestId('case-row')).toHaveCount(1);
    await runSuiteAndWait(page);
    await expect(page.getByRole('button', { name: 'Passed (1)' })).toBeVisible();
  });
});
