import { test, expect } from '@playwright/test';

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
