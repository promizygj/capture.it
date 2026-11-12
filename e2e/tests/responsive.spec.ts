import { expect, test } from '@playwright/test';
import { register } from './helpers';

test('mobile layout: navigation menu and no horizontal scroll', async ({ page }) => {
  await register(page);
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('link', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
