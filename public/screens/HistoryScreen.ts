import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * History screen - displays list of past workout sessions.
 * Simple screen with no charts or complex state.
 */
export class HistoryScreen extends BaseScreen {
  readonly id = 'history-screen';
  readonly route = '/history';

  private get $sessionHistory() {
    return document.getElementById('session-history');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const sessions = await api.getSessions();

    if (!this.$sessionHistory) return;

    if (sessions.length === 0) {
      this.$sessionHistory.innerHTML = '<p>No sessions yet</p>';
      return;
    }

    this.$sessionHistory.innerHTML = sessions.map(s => templates.renderHistoryItem(s)).join('');
  }

  // No cleanup needed - inherits empty exit() from BaseScreen
}
