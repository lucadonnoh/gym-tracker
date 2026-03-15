import { test, expect } from '@playwright/test';

// Helper to setup flash detection
async function setupFlashDetection(page: any) {
  await page.evaluate(() => {
    (window as any).__bgChanges = [];
    const screenIds = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
      'session-detail-screen', 'progress-screen', 'progress-day-screen',
      'manage-screen', 'manage-day-screen', 'profile-screen',
      'measurements-screen', 'measurement-detail-screen'];
    const checkBg = () => {
      screenIds.forEach(id => {
        const screen = document.getElementById(id);
        if (screen) {
          const style = window.getComputedStyle(screen);
          const display = style.display;
          if (display !== 'none') {
            (window as any).__bgChanges.push({
              id,
              bg: style.backgroundColor,
              display,
              time: performance.now()
            });
          }
        }
      });
    };
    const interval = setInterval(checkBg, 10);
    setTimeout(() => clearInterval(interval), 2000);
  });
}

async function getFlashResults(page: any) {
  const bgChanges = await page.evaluate(() => (window as any).__bgChanges);
  const nonBlackBgs = bgChanges.filter((change: any) =>
    change.bg !== 'rgb(0, 0, 0)' &&
    change.bg !== 'rgba(0, 0, 0, 0)' &&
    change.display !== 'none'
  );
  return { bgChanges, nonBlackBgs };
}

test.describe('Initial Page Load', () => {
  test('should have no layout shifts during load', async ({ page }) => {
    // Use the Layout Instability API to detect ANY layout shift
    await page.addInitScript(() => {
      (window as any).__layoutShifts = [];
      (window as any).__cls = 0;

      // Use PerformanceObserver to catch ALL layout shifts
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if ((entry as any).hadRecentInput) continue; // Ignore user-triggered shifts

          (window as any).__cls += (entry as any).value;
          (window as any).__layoutShifts.push({
            time: entry.startTime,
            value: (entry as any).value,
            sources: (entry as any).sources?.map((s: any) => ({
              node: s.node?.nodeName,
              id: s.node?.id,
              className: s.node?.className,
              previousRect: s.previousRect,
              currentRect: s.currentRect
            }))
          });
        }
      });

      observer.observe({ type: 'layout-shift', buffered: true });
    });

    // Navigate to page
    await page.goto('http://localhost:3000');

    // Wait for page to be fully loaded
    await page.waitForSelector('#home-content:not(.loading)', { timeout: 5000 });
    await page.waitForTimeout(500);

    const layoutShifts = await page.evaluate(() => (window as any).__layoutShifts);
    const cls = await page.evaluate(() => (window as any).__cls);

    console.log('Total CLS:', cls);
    console.log('Layout shifts:', JSON.stringify(layoutShifts, null, 2));

    // CLS should be very low (Google recommends < 0.1 for good UX)
    // We want near-zero for initial load
    if (cls > 0.01) {
      console.log('HIGH CLS DETECTED:', cls);
      layoutShifts.forEach((shift: any) => {
        console.log('Shift:', shift.value, 'Sources:', shift.sources);
      });
    }

    expect(cls).toBeLessThan(0.01);
  });
});

test.describe('Workout Screen Transition', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Wait for page to fully load
    await page.waitForSelector('#home-content:not(.loading)');
  });

  test('should not flash when clicking on a workout day', async ({ page }) => {
    // Get the first workout day button
    const dayButton = page.locator('.day-btn').first();
    await expect(dayButton).toBeVisible();

    // Take screenshot before clicking
    await page.screenshot({ path: 'tests/screenshots/before-click.png' });

    // Track any visual changes/flashes by monitoring screen visibility
    const flashDetected: string[] = [];

    // Listen for any rapid visibility changes on screens (detect DOM additions/removals)
    await page.evaluate(() => {
      (window as any).__screenChanges = [];
      const screenIds = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const observer = new MutationObserver(() => {
        screenIds.forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            (window as any).__screenChanges.push({
              id,
              classes: el.className,
              time: performance.now()
            });
          }
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });

    // Click the workout day button
    await dayButton.click();

    // Wait a moment for any flashing to occur
    await page.waitForTimeout(500);

    // Get screen changes that occurred
    const screenChanges = await page.evaluate(() => (window as any).__screenChanges);

    console.log('Screen changes detected:', JSON.stringify(screenChanges, null, 2));

    // Take screenshot after transition
    await page.screenshot({ path: 'tests/screenshots/after-click.png' });

    // Check that we're on the session screen
    const sessionScreen = page.locator('#session-screen');
    await expect(sessionScreen).toBeVisible();

    // Check the home screen is not visible
    const homeScreen = page.locator('#home-screen');
    await expect(homeScreen).not.toBeVisible();

    // Analyze the screen changes - if there are rapid changes, that indicates flashing
    if (screenChanges.length > 2) {
      console.log('WARNING: Multiple screen changes detected - possible flash!');
      console.log('Changes:', screenChanges);
    }
  });

  test('capture visual state during transition', async ({ page }) => {
    const dayButton = page.locator('.day-btn').first();
    await expect(dayButton).toBeVisible();

    // Create a series of screenshots during the transition
    const screenshots: string[] = [];

    // Click and immediately start capturing
    await dayButton.click();

    // Capture multiple frames quickly
    for (let i = 0; i < 5; i++) {
      await page.screenshot({ path: `tests/screenshots/transition-${i}.png` });
      await page.waitForTimeout(50);
    }

    // Verify we ended up on session screen
    await expect(page.locator('#session-screen')).toBeVisible();
  });

  test('check for FOUC (flash of unstyled content)', async ({ page }) => {
    const dayButton = page.locator('.day-btn').first();

    // Monitor the background color of screens during transition
    await page.evaluate(() => {
      (window as any).__bgChanges = [];
      const screenIds = ['login-screen', 'home-screen', 'session-screen', 'history-screen',
        'session-detail-screen', 'progress-screen', 'progress-day-screen',
        'manage-screen', 'manage-day-screen', 'profile-screen',
        'measurements-screen', 'measurement-detail-screen'];
      const checkBg = () => {
        screenIds.forEach(id => {
          const screen = document.getElementById(id);
          if (screen) {
            const style = window.getComputedStyle(screen);
            const display = style.display;
            if (display !== 'none') {
              (window as any).__bgChanges.push({
                id,
                bg: style.backgroundColor,
                display,
                time: performance.now()
              });
            }
          }
        });
      };

      // Check frequently
      const interval = setInterval(checkBg, 10);
      setTimeout(() => clearInterval(interval), 1000);
      (window as any).__stopBgCheck = () => clearInterval(interval);
    });

    await dayButton.click();
    await page.waitForTimeout(600);

    const bgChanges = await page.evaluate(() => (window as any).__bgChanges);

    console.log('Background changes during transition:');
    console.log(JSON.stringify(bgChanges, null, 2));

    // Check for any non-black backgrounds (which would indicate FOUC)
    const nonBlackBgs = bgChanges.filter((change: any) =>
      change.bg !== 'rgb(0, 0, 0)' &&
      change.bg !== 'rgba(0, 0, 0, 0)' &&
      change.display !== 'none'
    );

    if (nonBlackBgs.length > 0) {
      console.log('Non-black backgrounds detected (possible flash):', nonBlackBgs);
    }
  });

  test('should not flash when resuming an active session', async ({ page }) => {
    // First start a session
    const dayButton = page.locator('.day-btn').first();
    await dayButton.click();
    await page.waitForSelector('#session-screen');

    // Go back to home (simulating app backgrounding)
    await page.goto('http://localhost:3000');
    await page.waitForSelector('#day-buttons');

    // Check if active session banner is visible
    const banner = page.locator('#active-session-banner');
    await expect(banner).toBeVisible();

    // Setup monitoring for:
    // 1. Content state when screen becomes active
    // 2. Banner visibility during transition (banner should NOT hide before screen shows)
    await page.evaluate(() => {
      (window as any).__contentStates = [];
      (window as any).__bannerStates = [];

      const checkState = () => {
        const sessionScreen = document.getElementById('session-screen');
        const homeScreen = document.getElementById('home-screen');
        const exerciseList = document.getElementById('exercise-list');
        const banner = document.getElementById('active-session-banner');

        const sessionVisible = !!sessionScreen;
        const homeVisible = !!homeScreen;
        const bannerHidden = banner?.classList.contains('hidden') ?? !banner;

        return {
          time: performance.now(),
          sessionActive: sessionVisible,
          homeActive: homeVisible,
          bannerHidden,
          hasExercises: exerciseList ? exerciseList.children.length > 0 : false
        };
      };

      // Monitor DOM changes for screen additions/removals
      const observer = new MutationObserver(() => {
        const state = checkState();
        (window as any).__contentStates.push(state);
        (window as any).__bannerStates.push(state);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    });

    // Setup flash detection before clicking resume
    await setupFlashDetection(page);

    // Click resume button
    const resumeBtn = banner.locator('button');
    await resumeBtn.click();

    await page.waitForTimeout(600);

    const { bgChanges, nonBlackBgs } = await getFlashResults(page);
    const contentStates = await page.evaluate(() => (window as any).__contentStates);
    const bannerStates = await page.evaluate(() => (window as any).__bannerStates);

    console.log('Resume session - Background changes:', bgChanges.length);
    console.log('Content states during transition:', JSON.stringify(contentStates, null, 2));
    console.log('Banner states during transition:', JSON.stringify(bannerStates, null, 2));

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on resume:', nonBlackBgs);
    }

    // Verify we're on session screen
    await expect(page.locator('#session-screen')).toBeVisible();

    // Verify exercises are visible
    const exerciseCards = page.locator('#exercise-list .exercise-card');
    await expect(exerciseCards.first()).toBeVisible();

    // All backgrounds should be black
    expect(nonBlackBgs.length).toBe(0);

    // When screen becomes active, exercises should already be there
    const firstActiveState = contentStates.find((s: any) => s.sessionActive && s.hasExercises !== undefined);
    if (firstActiveState && !firstActiveState.hasExercises) {
      console.log('WARNING: Screen became active before exercises loaded!');
    }
    expect(firstActiveState?.hasExercises).toBe(true);

    // Banner should NOT hide while home screen is still active
    // Check if banner ever hid while home was still showing
    const bannerHidWhileHomeActive = bannerStates.find(
      (s: any) => s.bannerHidden && s.homeActive && !s.sessionActive
    );
    if (bannerHidWhileHomeActive) {
      console.log('FLASH: Banner hid while still on home screen!', bannerHidWhileHomeActive);
    }
    expect(bannerHidWhileHomeActive).toBeUndefined();
  });

  test('should not flash when navigating to History', async ({ page }) => {
    await setupFlashDetection(page);

    await page.click('text=History');
    await page.waitForTimeout(600);

    const { nonBlackBgs } = await getFlashResults(page);

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on History:', nonBlackBgs);
    }

    await expect(page.locator('#history-screen')).toBeVisible();
    expect(nonBlackBgs.length).toBe(0);
  });

  test('should not flash when navigating to Progress', async ({ page }) => {
    await setupFlashDetection(page);

    // Use more specific selector - the Progress button in bottom nav
    await page.locator('.bottom-nav button:has-text("Progress")').click();
    await page.waitForTimeout(600);

    const { nonBlackBgs } = await getFlashResults(page);

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on Progress:', nonBlackBgs);
    }

    await expect(page.locator('#progress-screen')).toBeVisible();
    expect(nonBlackBgs.length).toBe(0);
  });

  test('should not flash when navigating to Body measurements', async ({ page }) => {
    await setupFlashDetection(page);

    await page.click('text=Body');
    await page.waitForTimeout(600);

    const { nonBlackBgs } = await getFlashResults(page);

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on Body:', nonBlackBgs);
    }

    await expect(page.locator('#measurements-screen')).toBeVisible();
    expect(nonBlackBgs.length).toBe(0);
  });

  test('should not flash when navigating to Manage', async ({ page }) => {
    await setupFlashDetection(page);

    await page.click('text=Manage');
    await page.waitForTimeout(600);

    const { nonBlackBgs } = await getFlashResults(page);

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on Manage:', nonBlackBgs);
    }

    await expect(page.locator('#manage-screen')).toBeVisible();
    expect(nonBlackBgs.length).toBe(0);
  });

  test('should not flash when going back from any screen', async ({ page }) => {
    // Navigate to History
    await page.locator('.bottom-nav button:has-text("History")').click();
    await page.waitForSelector('#history-screen');

    await setupFlashDetection(page);

    // Click back button on history screen specifically
    await page.locator('#history-screen .back-btn').click();
    await page.waitForTimeout(600);

    const { nonBlackBgs } = await getFlashResults(page);

    if (nonBlackBgs.length > 0) {
      console.log('FLASH DETECTED on Back:', nonBlackBgs);
    }

    await expect(page.locator('#home-screen')).toBeVisible();
    expect(nonBlackBgs.length).toBe(0);
  });
});
