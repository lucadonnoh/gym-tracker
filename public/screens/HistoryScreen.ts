import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * History screen - displays list of past workout sessions.
 * Includes ability to backfill workouts for past dates.
 */
export class HistoryScreen extends BaseScreen {
  readonly id = 'history-screen';
  readonly route = '/history';

  private get $sessionHistory() {
    return document.getElementById('session-history');
  }

  private get $backfillModal() {
    return document.getElementById('backfill-modal');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const sessions = await api.getSessions();

    if (!this.$sessionHistory) return;

    // Add workout button + session list
    const addButton = `
      <button id="add-workout-btn" onclick="app.historyScreen_showBackfillModal()"
        class="w-full p-3 mb-4 bg-primary text-black font-semibold rounded-lg active:bg-primary-dim">
        + Add Past Workout
      </button>
    `;

    if (sessions.length === 0) {
      this.$sessionHistory.innerHTML = addButton + '<p>No sessions yet</p>';
    } else {
      this.$sessionHistory.innerHTML = addButton + sessions.map(s => templates.renderHistoryItem(s)).join('');
    }
  }

  showBackfillModal(): void {
    const state = this.ctx.getState();
    const today = new Date().toISOString().split('T')[0];

    const dayOptions = state.days.map(d =>
      `<option value="${d.id}">${d.display_name}</option>`
    ).join('');

    const modal = document.createElement('div');
    modal.id = 'backfill-modal';
    modal.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-surface border border-border rounded-lg p-5 w-full max-w-sm">
        <h3 class="text-lg font-semibold text-text-primary mb-4">Add Past Workout</h3>
        <label class="block text-sm text-text-secondary mb-1">Date</label>
        <input type="date" id="backfill-date" value="${today}" max="${today}"
          class="w-full p-3 mb-4 bg-black border border-border rounded-lg text-text-primary text-base">
        <label class="block text-sm text-text-secondary mb-1">Workout</label>
        <select id="backfill-day" class="w-full p-3 mb-5 bg-black border border-border rounded-lg text-text-primary text-base">
          ${dayOptions}
        </select>
        <div class="flex gap-3">
          <button onclick="app.historyScreen_hideBackfillModal()"
            class="flex-1 p-3 bg-transparent border border-border text-text-secondary font-medium rounded-lg active:bg-surface-elevated">Cancel</button>
          <button onclick="app.historyScreen_confirmBackfill()"
            class="flex-1 p-3 bg-primary text-black font-semibold rounded-lg active:bg-primary-dim">Start</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.hideBackfillModal();
    });
  }

  hideBackfillModal(): void {
    this.$backfillModal?.remove();
  }

  confirmBackfill(): void {
    const dateInput = document.getElementById('backfill-date') as HTMLInputElement;
    const daySelect = document.getElementById('backfill-day') as HTMLSelectElement;
    if (!dateInput?.value || !daySelect?.value) return;

    const date = dateInput.value;
    const dayId = Number(daySelect.value);
    this.hideBackfillModal();

    // @ts-ignore - app is global
    (window as any).app.startBackfillSession(dayId, date);
  }

  // No cleanup needed - inherits empty exit() from BaseScreen
}
