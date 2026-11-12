import { expect, test } from '@playwright/test';
import { PASSWORD, register } from './helpers';

test.describe('authentication', () => {
  test('register, sign out, sign back in', async ({ page }) => {
    const email = await register(page);
    await page.getByTestId('logout').click();
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login/); // protected route

    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@e2e.test');
    await page.getByLabel('Password').fill('WrongPass1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Invalid email or password');
  });

  test('validates weak passwords on registration', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel('Full name').fill('Weak');
    await page.getByLabel('Email').fill('weak@e2e.test');
    await page.getByLabel('Password').fill('abcdefgh');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('number');
  });

  test('password recovery request does not reveal accounts', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('maybe@e2e.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText('If an account exists')).toBeVisible();
  });

  test('updates the profile name', async ({ page }) => {
    await register(page);
    await page.goto('/profile');
    await page.getByLabel('Name').fill('Renamed Tester');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile updated')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Renamed Tester' })).toBeVisible();
  });
});
