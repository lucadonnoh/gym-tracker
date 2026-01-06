import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';

/**
 * Active session screen - shows the current workout in progress.
 *
 * Note: This screen is special - most of the logic remains in app.ts
 * because it involves timers, exercise interactions, and complex state.
 * The enter() method is minimal and relies on the session being pre-loaded.
 */
export class SessionScreen extends BaseScreen {
  readonly id = 'session-screen';
  readonly route = '/session';

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const state = this.ctx.getState();

    // If no active session, redirect to home
    if (!state.currentSession) {
      this.ctx.navigate('home-screen');
      return;
    }

    // Session content is loaded by app.ts enterSessionScreen()
    // This screen component just handles the routing
  }

  exit(): void {
    // Timer cleanup is handled by app.ts
    // Just call parent for any registered cleanup
    super.exit();
  }
}
