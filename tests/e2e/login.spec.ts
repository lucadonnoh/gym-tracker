import { test, expect } from '@playwright/test';

test.describe('Login Page', () => {
  test('should load without JavaScript errors', async ({ page }) => {
    const jsErrors: string[] = [];

    // Capture ALL JavaScript errors
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });

    // Also capture console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/');

    // Wait for page to fully load and execute JS
    await page.waitForLoadState('networkidle');

    // Give any async initialization time to run
    await page.waitForTimeout(500);

    // Fail if ANY JavaScript errors occurred
    expect(jsErrors, `JavaScript errors detected: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should display login form elements', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check login form is visible
    await expect(page.locator('#login-screen')).toBeVisible();
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#login-submit')).toBeVisible();

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should handle login attempt without errors', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Try to interact with the login form
    await page.fill('#login-username', 'testuser');
    await page.fill('#login-password', 'testpass');

    // Click login - even if it fails auth, there should be no JS errors
    await page.click('#login-submit');

    // Wait for any async operations
    await page.waitForTimeout(1000);

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});
