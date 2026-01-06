import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForTimeout(2000);
  });

  test('should navigate back from session detail without getting stuck', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    // Go to History
    await page.click('button:has-text("History")');
    await page.waitForTimeout(1000);

    // Check we're on history screen
    const historyScreen = page.locator('#history-screen');
    await expect(historyScreen).toHaveClass(/active/);

    // Click on first history entry (if exists)
    const historyItem = page.locator('.history-item').first();
    if (await historyItem.isVisible()) {
      await historyItem.click();
      await page.waitForTimeout(1000);

      // Should be on session detail screen
      const detailScreen = page.locator('#session-detail-screen');
      await expect(detailScreen).toHaveClass(/active/);

      // Click Back button
      await page.click('#session-detail-screen .back-btn');
      await page.waitForTimeout(1000);

      // Should NOT be stuck in loading - should show history screen with content
      const screenState = await page.evaluate(() => {
        const activeScreen = document.querySelector('.screen.active');
        const historyContent = document.querySelector('#session-history')?.innerHTML || '';
        return {
          activeScreenId: activeScreen?.id || 'none',
          hasActiveScreen: activeScreen !== null,
          historyContent: historyContent,
          isShowingLoading: historyContent.includes('Loading...')
        };
      });

      expect(screenState.hasActiveScreen, `No active screen!`).toBe(true);
      // Should be back on history screen
      expect(screenState.activeScreenId).toBe('history-screen');
      // Should NOT be stuck on Loading... - should have actual history items
      expect(screenState.isShowingLoading, `Stuck on Loading! Content: ${screenState.historyContent}`).toBe(false);
    }

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});

test.describe('Manage Screen', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.fill('#login-username', 'donnoh');
    await page.fill('#login-password', '1234');
    await page.click('#login-submit');
    await page.waitForTimeout(2000);

    // Navigate to Manage screen
    await page.click('button:has-text("Manage")');
    await page.waitForTimeout(500);
  });

  test('should open and close Add Day modal with Cancel button', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    // Click Add Day button
    await page.click('#add-day-btn');
    await page.waitForTimeout(300);

    // Modal should be visible
    const modal = page.locator('#day-modal');
    await expect(modal).toBeVisible();

    // Click Cancel button
    await page.click('#day-modal button:has-text("Cancel")');
    await page.waitForTimeout(300);

    // Modal should be hidden
    await expect(modal).not.toBeVisible();

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });

  test('should close modal when clicking Cancel in exercise modal', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    // Select a day first (if available)
    const daySelect = page.locator('#manage-day-select');
    const options = await daySelect.locator('option').count();

    if (options > 1) {
      // Select first actual day (skip "Select workout day..." option)
      await daySelect.selectOption({ index: 1 });
      await page.waitForTimeout(500);

      // Click Add Exercise button
      const addExerciseBtn = page.locator('#add-exercise-btn');
      if (await addExerciseBtn.isVisible()) {
        await addExerciseBtn.click();
        await page.waitForTimeout(300);

        // Modal should be visible
        const modal = page.locator('#exercise-modal');
        await expect(modal).toBeVisible();

        // Click Cancel button
        await page.click('#exercise-modal button:has-text("Cancel")');
        await page.waitForTimeout(300);

        // Modal should be hidden
        await expect(modal).not.toBeVisible();
      }
    }

    expect(jsErrors, `JavaScript errors: ${jsErrors.join(', ')}`).toHaveLength(0);
  });
});
