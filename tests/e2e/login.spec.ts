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

  test('should not go blank/black after page load', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait longer to catch delayed issues (auth checks, async operations)
    await page.waitForTimeout(2000);

    // Check that the page hasn't gone blank
    // 1. Body should have visible content
    const bodyContent = await page.evaluate(() => {
      const body = document.body;
      // Check if body has any visible text content
      const textContent = body.innerText.trim();
      // Check if body or main container is hidden
      const bodyStyle = window.getComputedStyle(body);
      const isHidden = bodyStyle.display === 'none' || bodyStyle.visibility === 'hidden';
      // Check background color (black screen detection)
      const bgColor = bodyStyle.backgroundColor;

      return {
        hasText: textContent.length > 0,
        textLength: textContent.length,
        isHidden,
        bgColor,
        html: body.innerHTML.substring(0, 500)
      };
    });

    // Fail if page appears blank
    expect(bodyContent.isHidden, 'Body should not be hidden').toBe(false);
    expect(bodyContent.hasText, `Page should have visible text content. HTML: ${bodyContent.html}`).toBe(true);
    expect(bodyContent.textLength, 'Page should have substantial content').toBeGreaterThan(10);

    // Either login screen OR main app should be visible
    const loginVisible = await page.locator('#login-screen').isVisible().catch(() => false);
    const appVisible = await page.locator('#app').isVisible().catch(() => false);

    expect(loginVisible || appVisible, 'Either login screen or app should be visible').toBe(true);

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should handle stale/invalid token gracefully (not black screen)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      // Ignore expected 401 errors when testing stale tokens
      if (msg.type() === 'error' && !msg.text().includes('401')) {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    // Set a stale/invalid token BEFORE navigating
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('gym_tracker_token', 'invalid-stale-token-12345');
    });

    // Now reload the page - this simulates returning with a stale token
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for auth check to complete
    await page.waitForTimeout(3000);

    // Should show login screen (token invalid), not black screen
    const screenState = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const visibleScreens = screens.filter(id => document.getElementById(id));
      const active = visibleScreens.length > 0 ? visibleScreens[0] : null;

      return {
        hasActiveScreen: active !== null,
        activeScreenId: active || 'none',
        screensWithActiveCount: visibleScreens.length,
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    // Must have exactly one active screen
    expect(screenState.hasActiveScreen, `No active screen! Body: ${screenState.bodyText}`).toBe(true);
    expect(screenState.screensWithActiveCount, 'Should have exactly one active screen').toBe(1);

    // Should be on login screen (since token was invalid)
    expect(screenState.activeScreenId).toBe('login-screen');

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should show home screen after successful login (not black screen)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Login with test credentials
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');

    // Wait for login to complete and home screen to load
    await page.waitForTimeout(3000);

    // Check that we see the home screen, not a black screen
    const screenState = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const active = screens.find(id => document.getElementById(id));

      return {
        hasActiveScreen: !!active,
        activeScreenId: active || 'none',
        loginVisible: !!document.getElementById('login-screen'),
        homeVisible: !!document.getElementById('home-screen'),
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    // Must have an active screen
    expect(screenState.hasActiveScreen, `No active screen found! Body text: ${screenState.bodyText}`).toBe(true);

    // After login, home screen should be active (not login)
    expect(screenState.homeVisible, `Home screen should be visible after login. Active: ${screenState.activeScreenId}`).toBe(true);

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should show home screen on page refresh with valid token (not black screen)', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('401')) {
        jsErrors.push(`Console error: ${msg.text()}`);
      }
    });

    // First, login to get a valid token
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForTimeout(2000);

    // Verify we're on home screen
    let screenState = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const active = screens.find(id => document.getElementById(id));
      return {
        activeScreenId: active || 'none',
        hasToken: localStorage.getItem('gym_tracker_token') !== null
      };
    });
    expect(screenState.hasToken, 'Should have token after login').toBe(true);
    expect(screenState.activeScreenId, 'Should be on home screen after login').toBe('home-screen');

    // Now REFRESH the page - this simulates returning with valid token
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait for init to complete
    await page.waitForTimeout(3000);

    // Check screen state after refresh
    const refreshState = await page.evaluate(() => {
      const screens = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const active = screens.find(id => document.getElementById(id));
      return {
        hasActiveScreen: !!active,
        activeScreenId: active || 'none',
        bodyText: document.body.innerText.substring(0, 300)
      };
    });

    // Must have an active screen (not black screen!)
    expect(refreshState.hasActiveScreen, `No active screen after refresh! Body: ${refreshState.bodyText}`).toBe(true);

    // Should show home screen (not login, since token is valid)
    expect(refreshState.activeScreenId, `Expected home-screen after refresh with valid token. Got: ${refreshState.activeScreenId}`).toBe('home-screen');

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});
