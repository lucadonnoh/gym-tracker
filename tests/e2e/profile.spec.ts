import { test, expect } from '@playwright/test';

test.describe('Profile Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForTimeout(2000);

    // Verify we're on home screen
    const activeScreen = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      return screens.find(id => document.getElementById(id));
    });
    expect(activeScreen).toBe('home-screen');
  });

  test('should navigate to profile screen when clicking profile button', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    // Find and click the profile button
    const profileButton = page.locator('.profile-btn');
    await expect(profileButton).toBeVisible();
    await profileButton.click();

    // Wait for navigation
    await page.waitForTimeout(1000);

    // Check that profile screen is now active
    const screenState = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const active = screens.find(id => document.getElementById(id));
      return {
        activeScreenId: active || 'none',
        url: window.location.pathname
      };
    });

    expect(screenState.activeScreenId).toBe('profile-screen');
    expect(screenState.url).toBe('/profile');

    // Verify profile screen has expected content
    await expect(page.locator('#profile-screen')).toBeVisible();

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('profile button should be clickable and not blocked by other elements', async ({ page }) => {
    // Check button is clickable using force:false (default)
    const profileButton = page.locator('.profile-btn');
    await expect(profileButton).toBeVisible();
    await expect(profileButton).toBeEnabled();

    // Trigger click
    await profileButton.click();

    // Wait and verify navigation happened
    await page.waitForTimeout(500);

    const activeScreen = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      return screens.find(id => document.getElementById(id));
    });
    expect(activeScreen).toBe('profile-screen');
  });

  test('profile button should work on mobile viewport', async ({ browser }) => {
    // Create a new context with touch enabled and mobile viewport
    const context = await browser.newContext({
      viewport: { width: 375, height: 667 },
      hasTouch: true
    });
    const page = await context.newPage();

    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    // Login first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForTimeout(2000);

    // Find and tap the profile button
    const profileButton = page.locator('.profile-btn');
    await expect(profileButton).toBeVisible();

    // Use tap for mobile simulation
    await profileButton.tap();

    // Wait for navigation
    await page.waitForTimeout(1000);

    // Check that profile screen is now active
    const activeScreen = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      return screens.find(id => document.getElementById(id));
    });

    expect(activeScreen).toBe('profile-screen');
    expect(jsErrors).toHaveLength(0);

    await context.close();
  });
});
