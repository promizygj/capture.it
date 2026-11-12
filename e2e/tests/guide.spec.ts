import { test, expect } from '@playwright/test';
import { register } from './helpers';

test('user guide opens from the sidebar and its section links work', async ({ page }) => {
  await register(page);
  await page.getByRole('link', { name: 'User guide' }).click();
  await expect(page).toHaveURL(/\/guide$/);
  const guide = page.getByTestId('user-guide');
  await expect(guide.getByRole('heading', { name: 'Capture.It — User Guide', level: 1 })).toBeVisible();

  await guide.getByRole('link', { name: 'Run tests automatically with schedules' }).click();
  await expect(page).toHaveURL(/#6-run-tests-automatically-with-schedules$/);
  await expect(page.getByRole('heading', { name: '6. Run tests automatically with schedules' })).toBeInViewport();

  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'C.14 Security testing (basic checks)' }).click();
  await expect(page.getByRole('heading', { name: 'C.14 Security testing (basic checks)' })).toBeInViewport();
});
