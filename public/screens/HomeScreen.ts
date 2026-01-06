import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * Home screen - the main dashboard with workout day buttons and stats.
 */
export class HomeScreen extends BaseScreen {
  readonly id = 'home-screen';
  readonly route = '/';

  private get $dayButtons() {
    return document.getElementById('day-buttons');
  }

  private get $statsContainer() {
    return document.getElementById('stats-container');
  }

  private get $activeSessionBanner() {
    return document.getElementById('active-session-banner');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const state = this.ctx.getState();

    // Render day buttons
    if (this.$dayButtons) {
      this.$dayButtons.innerHTML = state.days.map(d => templates.renderDayButton(d)).join('');
    }

    // Load and render stats
    try {
      const stats = await api.getSummaryStats();
      if (this.$statsContainer) {
        this.$statsContainer.innerHTML = templates.renderSummaryStats(stats);
      }
    } catch (err) {
      console.error('Failed to load summary stats', err);
    }

    // Show/hide active session banner
    if (state.currentSession) {
      this.$activeSessionBanner?.classList.remove('hidden');
    } else {
      this.$activeSessionBanner?.classList.add('hidden');
    }
  }

  // No cleanup needed
}
