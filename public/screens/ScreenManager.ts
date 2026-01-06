import type { Screen, RouteParams, ScreenContext } from './types.js';

/**
 * Manages screen navigation and lifecycle.
 * Ensures data is loaded BEFORE screens are shown.
 */
export class ScreenManager {
  private screens: Map<string, Screen> = new Map();
  private activeScreen: Screen | null = null;
  private ctx: ScreenContext;

  constructor(ctx: ScreenContext) {
    this.ctx = ctx;
  }

  /**
   * Register a screen with the manager.
   */
  register(screen: Screen): void {
    this.screens.set(screen.id, screen);
  }

  /**
   * Get a registered screen by ID.
   */
  get(screenId: string): Screen | undefined {
    return this.screens.get(screenId);
  }

  /**
   * Check if a screen is registered.
   */
  has(screenId: string): boolean {
    return this.screens.has(screenId);
  }

  /**
   * Navigate to a screen by ID.
   * This is THE KEY method - it loads data BEFORE showing the screen.
   */
  async navigateTo(screenId: string, params: RouteParams = {}, updateUrl: boolean = true): Promise<void> {
    const screen = this.screens.get(screenId);
    if (!screen) {
      console.error(`Unknown screen: ${screenId}`);
      return;
    }

    // 1. Exit current screen (cleanup charts, timers, etc.)
    if (this.activeScreen) {
      this.activeScreen.exit();
    }

    // 2. Load data BEFORE showing - THE KEY TO PREVENTING BUGS!
    await screen.enter(params);

    // 3. Force DOM update before showing
    await new Promise(resolve => requestAnimationFrame(resolve));

    // 4. Now show the screen (content is already loaded)
    this.ctx.showScreen(screenId);
    this.ctx.scrollToTop();

    // 5. Update URL if needed
    if (updateUrl) {
      this.ctx.updateUrl(screenId, params);
    }

    this.activeScreen = screen;
  }

  /**
   * Get the currently active screen.
   */
  getActiveScreen(): Screen | null {
    return this.activeScreen;
  }

  /**
   * Match a URL path to a registered screen.
   * Returns the screen and extracted parameters.
   */
  matchRoute(path: string): { screen: Screen; params: RouteParams } | null {
    for (const screen of this.screens.values()) {
      const params = this.extractParams(screen.route, path);
      if (params !== null) {
        return { screen, params };
      }
    }
    return null;
  }

  /**
   * Extract route parameters from a path.
   * '/history/:id' + '/history/123' => { id: '123' }
   */
  private extractParams(pattern: string, path: string): RouteParams | null {
    // Convert '/history/:id' to regex '/history/(?<id>[^/]+)'
    const regexPattern = pattern
      .replace(/:[a-zA-Z]+/g, (match) => `(?<${match.slice(1)}>[^/]+)`)
      .replace(/\//g, '\\/');

    const regex = new RegExp(`^${regexPattern}$`);
    const match = path.match(regex);

    if (!match) return null;
    return match.groups || {};
  }
}
