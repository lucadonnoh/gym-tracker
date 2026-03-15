import { test, expect } from '@playwright/test';

test.describe('Screen Loading', () => {
  let pageErrors: string[] = [];
  const baseUrl = process.env.BASE_URL || 'http://localhost:3002';

  test.beforeEach(async ({ page }) => {
    pageErrors = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        const text = msg.text();
        console.log('CONSOLE ERROR:', text);
        // Ignore known non-critical errors
        if (!text.includes('Permissions-Policy') && !text.includes('favicon')) {
          pageErrors.push(text);
        }
      }
    });
    page.on('pageerror', err => {
      console.log('PAGE ERROR:', err.message);
      pageErrors.push(err.message);
    });

    // Login first
    await page.goto(baseUrl);
    await page.waitForSelector('#login-username', { timeout: 5000 });
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForSelector('#home-screen', { timeout: 5000 });
  });

  test.afterEach(async () => {
    // Fail test if there were any JavaScript errors
    expect(pageErrors, `Page had JavaScript errors: ${pageErrors.join(', ')}`).toHaveLength(0);
  });

  test('should scroll to top when navigating to a new screen', async ({ page }) => {
    // Use mobile viewport (iPhone X size)
    await page.setViewportSize({ width: 375, height: 812 });

    // Wait for home content to load
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });

    // Try to scroll down on home page
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    // Navigate to History
    await page.locator('#home-screen button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toBeVisible({ timeout: 2000 });

    // Wait for content to fully load
    await page.waitForTimeout(500);

    // Check scroll position is reset to top
    const scrollAfter = await page.evaluate(() => window.scrollY);

    // Only assert scroll reset if page was scrollable
    if (scrollBefore > 0) {
      expect(scrollAfter).toBe(0);
    }
  });

  test('History screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to History
    await page.locator('#home-screen button:has-text("History")').click();

    // Wait for screen to be visible
    await expect(page.locator('#history-screen')).toBeVisible({ timeout: 2000 });

    // Content should load within 3 seconds - should NOT still be showing "Loading..."
    await page.waitForTimeout(3000);

    // Check that we have either history items OR an empty state message (not loading)
    const historyContent = page.locator('#session-history');
    const html = await historyContent.innerHTML();

    console.log('History content:', html);

    // Should not contain "Loading" text
    expect(html.toLowerCase()).not.toContain('loading');

    // Should have some content (either items or empty state)
    expect(html.trim().length).toBeGreaterThan(0);
  });

  test('Add Past Workout button should open backfill modal without errors', async ({ page }) => {
    // Navigate to History
    await page.locator('#home-screen button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(1000);

    // Click the Add Past Workout button
    const addBtn = page.locator('#add-workout-btn');
    await expect(addBtn).toBeVisible();
    await addBtn.click();

    // Modal should appear
    const modal = page.locator('#backfill-modal');
    await expect(modal).toBeVisible({ timeout: 2000 });

    // Modal must be a fixed overlay covering the viewport
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(modalBox!.x).toBe(0);
    expect(modalBox!.y).toBe(0);
    expect(modalBox!.width).toBeGreaterThanOrEqual(viewport.width - 1);
    expect(modalBox!.height).toBeGreaterThanOrEqual(viewport.height - 1);

    // Date input and day select must be visible within the viewport
    const dateBox = await page.locator('#backfill-date').boundingBox();
    const dayBox = await page.locator('#backfill-day').boundingBox();
    expect(dateBox).not.toBeNull();
    expect(dayBox).not.toBeNull();
    expect(dateBox!.y).toBeGreaterThanOrEqual(0);
    expect(dateBox!.y).toBeLessThan(viewport.height);
    expect(dayBox!.y).toBeGreaterThanOrEqual(0);
    expect(dayBox!.y).toBeLessThan(viewport.height);

    // No JS errors should have occurred
    expect(pageErrors).toHaveLength(0);
  });

  test('Body Measurements screen should load content without JS errors', async ({ page }) => {
    // Navigate to Body Measurements
    await page.locator('#home-screen button:has-text("Body")').click();

    // Wait for screen to be visible
    await expect(page.locator('#measurements-screen')).toBeVisible({ timeout: 2000 });

    // Content should load within 3 seconds
    await page.waitForTimeout(3000);

    // Check multiple content areas
    const summaryContent = page.locator('#measurements-summary');
    const historyContent = page.locator('#measurements-history');

    const summaryHtml = await summaryContent.innerHTML();
    const historyHtml = await historyContent.innerHTML();

    console.log('Measurements summary:', summaryHtml);
    console.log('Measurements history:', historyHtml);

    // Should not contain "Loading" text in either area
    expect(summaryHtml.toLowerCase()).not.toContain('loading');
    expect(historyHtml.toLowerCase()).not.toContain('loading');

    // Verify no JS errors occurred (checked in afterEach)
  });

  test('Progress screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to Progress
    await page.locator('#home-screen button:has-text("Progress")').click();

    // Wait for screen to be visible
    await expect(page.locator('#progress-screen')).toBeVisible({ timeout: 2000 });

    // Content should load within 3 seconds
    await page.waitForTimeout(3000);

    // Check content area
    const chartsContent = page.locator('#progress-charts');
    const html = await chartsContent.innerHTML();

    console.log('Progress content:', html);

    // Should not contain "Loading" text
    expect(html.toLowerCase()).not.toContain('loading');
  });

  test('Manage screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to Manage
    await page.locator('#home-screen button:has-text("Manage")').click();

    // Wait for screen to be visible
    await expect(page.locator('#manage-screen')).toBeVisible({ timeout: 2000 });

    // Content should load within 3 seconds
    await page.waitForTimeout(3000);

    // Check content area
    const exerciseList = page.locator('#manage-exercise-list');
    const html = await exerciseList.innerHTML();

    console.log('Manage content:', html);

    // Should not contain "Loading" text
    expect(html.toLowerCase()).not.toContain('loading');
  });
});
