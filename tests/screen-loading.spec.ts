import { test, expect } from '@playwright/test';

test.describe('Screen Loading', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('CONSOLE ERROR:', msg.text());
      }
    });
    page.on('pageerror', err => {
      console.log('PAGE ERROR:', err.message);
    });

    await page.goto('http://localhost:3000');
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });
  });

  test('should scroll to top when navigating to a new screen', async ({ page }) => {
    // Scroll down on home page
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    console.log('Scroll position before navigation:', scrollBefore);
    expect(scrollBefore).toBeGreaterThan(0);

    // Navigate to History
    await page.locator('.bottom-nav button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Wait for content to fully load and any async operations to complete
    await page.waitForTimeout(500);

    // Check scroll position is reset to top
    const scrollAfter = await page.evaluate(() => window.scrollY);
    console.log('Scroll position after navigation:', scrollAfter);
    expect(scrollAfter).toBe(0);
  });

  test('should scroll to top when navigating with active session banner visible', async ({ page }) => {
    // First start a session to get the active session banner
    const dayButton = page.locator('.day-btn').first();
    await dayButton.click();
    await page.waitForSelector('#session-screen.active');

    // Go back to home (this should show the active session banner)
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });

    // Verify the banner is visible
    const banner = page.locator('#active-session-banner');
    await expect(banner).toBeVisible();
    console.log('Active session banner is visible');

    // Scroll down on home page (past the banner)
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    console.log('Scroll position before navigation (with banner):', scrollBefore);
    expect(scrollBefore).toBeGreaterThan(0);

    // Navigate to History
    await page.locator('.bottom-nav button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Wait for content to fully load
    await page.waitForTimeout(500);

    // Check scroll position is reset to top
    const scrollAfter = await page.evaluate(() => window.scrollY);
    console.log('Scroll position after navigation (with banner):', scrollAfter);
    expect(scrollAfter).toBe(0);
  });

  test('should scroll to top when going back from a screen', async ({ page }) => {
    // Navigate to History first
    await page.locator('.bottom-nav button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });
    await page.waitForTimeout(300);

    // Scroll down on History page
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(100);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    console.log('Scroll position before going back:', scrollBefore);

    // Go back to home
    await page.locator('#history-screen .back-btn').click();
    await expect(page.locator('#home-screen')).toHaveClass(/active/, { timeout: 2000 });
    await page.waitForTimeout(500);

    // Check scroll position is reset to top
    const scrollAfter = await page.evaluate(() => window.scrollY);
    console.log('Scroll position after going back:', scrollAfter);
    expect(scrollAfter).toBe(0);
  });

  test('History screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to History
    await page.locator('.bottom-nav button:has-text("History")').click();

    // Wait for screen to be active
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });

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

  test('Body Measurements screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to Body Measurements
    await page.locator('.bottom-nav button:has-text("Body")').click();

    // Wait for screen to be active
    await expect(page.locator('#measurements-screen')).toHaveClass(/active/, { timeout: 2000 });

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
  });

  test('Progress screen should load content and not show loading forever', async ({ page }) => {
    // Navigate to Progress
    await page.locator('.bottom-nav button:has-text("Progress")').click();

    // Wait for screen to be active
    await expect(page.locator('#progress-screen')).toHaveClass(/active/, { timeout: 2000 });

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
    await page.locator('.bottom-nav button:has-text("Manage")').click();

    // Wait for screen to be active
    await expect(page.locator('#manage-screen')).toHaveClass(/active/, { timeout: 2000 });

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
