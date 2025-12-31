import { test, expect } from '@playwright/test';

test.describe('Chart Loading', () => {
  test('charts should render with stable dimensions and not crash', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });

    // Navigate to History
    await page.locator('.bottom-nav button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Click on a session to see details
    const historyItem = page.locator('.history-item').first();
    await historyItem.click();
    await expect(page.locator('#session-detail-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Click on an exercise to see progress charts
    const exerciseHeader = page.locator('.detail-exercise-header').first();
    await exerciseHeader.click();
    await expect(page.locator('#progress-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Wait for charts to render
    await page.waitForTimeout(500);

    // Get initial canvas dimensions
    const initialDimensions = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#progress-charts canvas');
      return Array.from(canvases).map(c => ({
        width: (c as HTMLCanvasElement).offsetWidth,
        height: (c as HTMLCanvasElement).offsetHeight
      }));
    });

    console.log('Initial canvas dimensions:', initialDimensions);

    // Verify canvases exist and have reasonable dimensions
    expect(initialDimensions.length).toBeGreaterThan(0);
    for (const dim of initialDimensions) {
      expect(dim.width).toBeGreaterThan(0);
      expect(dim.height).toBeGreaterThan(0);
      expect(dim.height).toBeLessThan(500); // Should not be excessively tall
    }

    // Wait a bit more and check dimensions are stable (no infinite growth)
    await page.waitForTimeout(1000);

    const finalDimensions = await page.evaluate(() => {
      const canvases = document.querySelectorAll('#progress-charts canvas');
      return Array.from(canvases).map(c => ({
        width: (c as HTMLCanvasElement).offsetWidth,
        height: (c as HTMLCanvasElement).offsetHeight
      }));
    });

    console.log('Final canvas dimensions:', finalDimensions);

    // Dimensions should be stable (not growing)
    for (let i = 0; i < initialDimensions.length; i++) {
      expect(finalDimensions[i].height).toBeLessThanOrEqual(initialDimensions[i].height + 5);
    }
  });

  test('should track canvas size changes during chart load', async ({ page }) => {
    // This test monitors for layout shifts by tracking element size changes
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });

    // Navigate to History -> Session Detail
    await page.locator('.bottom-nav button:has-text("History")').click();
    await expect(page.locator('#history-screen')).toHaveClass(/active/, { timeout: 2000 });

    const historyItem = page.locator('.history-item').first();
    await historyItem.click();
    await expect(page.locator('#session-detail-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Setup size change monitoring before clicking on exercise
    await page.evaluate(() => {
      (window as any).__sizeChanges = [];
      const observer = new MutationObserver(() => {
        const container = document.getElementById('progress-charts');
        if (container) {
          (window as any).__sizeChanges.push({
            time: performance.now(),
            height: container.offsetHeight,
            children: container.children.length
          });
        }
      });

      const progressScreen = document.getElementById('progress-screen');
      if (progressScreen) {
        observer.observe(progressScreen, { childList: true, subtree: true, attributes: true });
      }
    });

    // Click on an exercise to see progress charts
    const exerciseHeader = page.locator('.detail-exercise-header').first();
    await exerciseHeader.click();
    await expect(page.locator('#progress-screen')).toHaveClass(/active/, { timeout: 2000 });

    // Wait for charts to fully render
    await page.waitForTimeout(2000);

    const sizeChanges = await page.evaluate(() => (window as any).__sizeChanges || []);
    console.log('Size changes during load:', sizeChanges.length);

    if (sizeChanges.length > 0) {
      console.log('First few changes:', sizeChanges.slice(0, 5));
      console.log('Last few changes:', sizeChanges.slice(-3));
    }

    // The container height should stabilize (last few readings should be similar)
    if (sizeChanges.length >= 3) {
      const lastThree = sizeChanges.slice(-3);
      const heights = lastThree.map((s: any) => s.height);
      const maxDiff = Math.max(...heights) - Math.min(...heights);
      console.log('Height stability (max diff in last 3 readings):', maxDiff);
      expect(maxDiff).toBeLessThan(50); // Heights should be stable
    }
  });
});
