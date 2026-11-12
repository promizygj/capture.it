import { expect, test } from '@playwright/test';
import { addPageLoadCase, createProject, createSuite, register, runSuiteAndWait } from './helpers';

test('execution history: filter by status and compare runs', async ({ page }) => {
  await register(page);
  await createProject(page, 'E2E History');
  await createSuite(page, 'Regression');
  await addPageLoadCase(page, 'Stable', '/demo/');
  await runSuiteAndWait(page);

  // Break the second run by adding a failing case
  await page.goBack();
  await addPageLoadCase(page, 'Breaks', '/demo/', { title: 'Wrong title' });
  await runSuiteAndWait(page);

  await page.goto('/runs');
  const rows = page.locator('table tbody tr');
  await expect(rows).toHaveCount(2);
  await page.getByTestId('status-filter').selectOption({ label: 'Failed' });
  await expect(rows).toHaveCount(1);
  await page.getByTestId('status-filter').selectOption({ label: 'All statuses' });
  await expect(rows).toHaveCount(2);

  await rows.nth(0).getByRole('checkbox').check();
  await rows.nth(1).getByRole('checkbox').check();
  await page.getByRole('button', { name: /Compare/ }).click();
  await expect(page.getByRole('heading', { name: 'Compare test runs' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'Breaks' })).toContainText('New');
});
