import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';

// Chart.js is loaded via script tag
declare const Chart: any;

/**
 * Progress screen - displays exercise progress charts.
 * Has chart cleanup responsibility.
 */
export class ProgressScreen extends BaseScreen {
  readonly id = 'progress-screen';
  readonly route = '/progress';

  private get $progressDaySelect() {
    return document.getElementById('progress-day-select') as HTMLSelectElement | null;
  }

  private get $progressCharts() {
    return document.getElementById('progress-charts');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    // Populate day dropdown from app state
    const state = this.ctx.getState();

    if (this.$progressDaySelect) {
      this.$progressDaySelect.innerHTML = '<option value="">Select workout day...</option>' +
        state.days.map(d => `<option value="${d.id}">${d.display_name}</option>`).join('');
    }

    // Clear charts container (user needs to select a day first)
    if (this.$progressCharts) {
      this.$progressCharts.innerHTML = '';
    }
  }

  // Charts are loaded via loadDayProgress() called from onclick
  // Cleanup handled by BaseScreen.exit() - charts registered via registerChart()
}
