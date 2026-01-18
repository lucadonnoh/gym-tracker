import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import * as templates from '../templates.js';

/**
 * Progress screen - shows list of workout days to view progress.
 */
export class ProgressScreen extends BaseScreen {
  readonly id = 'progress-screen';
  readonly route = '/progress';

  private get $progressDayButtons() {
    return document.getElementById('progress-day-buttons');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const state = this.ctx.getState();

    // Render day buttons
    if (this.$progressDayButtons) {
      if (state.days.length === 0) {
        this.$progressDayButtons.innerHTML = '<p class="p-4 text-text-muted text-center">No workout days yet</p>';
      } else {
        this.$progressDayButtons.innerHTML = state.days.map(d => templates.renderProgressDayButton(d)).join('');
      }
    }
  }
}
