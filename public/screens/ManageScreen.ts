import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';

/**
 * Manage screen - allows adding/editing workout days and exercises.
 * Note: loadDayExercises() is called from onclick handlers and stays in app.ts
 */
export class ManageScreen extends BaseScreen {
  readonly id = 'manage-screen';
  readonly route = '/manage';

  private get $manageDaySelect() {
    return document.getElementById('manage-day-select') as HTMLSelectElement | null;
  }

  private get $manageExerciseList() {
    return document.getElementById('manage-exercise-list');
  }

  private get $addExerciseBtn() {
    return document.getElementById('add-exercise-btn');
  }

  private get $adminSection() {
    return document.getElementById('admin-section');
  }

  private get $userList() {
    return document.getElementById('user-list');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    // Populate day dropdown from app state
    const state = this.ctx.getState();

    if (this.$manageDaySelect) {
      this.$manageDaySelect.innerHTML = '<option value="">Select workout day...</option>' +
        state.days.map(d => `<option value="${d.id}">${d.display_name}</option>`).join('');
    }

    // Clear exercise list (user needs to select a day first)
    if (this.$manageExerciseList) {
      this.$manageExerciseList.innerHTML = '';
    }

    // Hide add button until day is selected
    this.$addExerciseBtn?.classList.add('hidden');

    // Show admin section only for admins
    if (state.currentUser?.is_admin) {
      this.$adminSection?.classList.remove('hidden');
      this.loadUsers();
    } else {
      this.$adminSection?.classList.add('hidden');
    }
  }

  private async loadUsers(): Promise<void> {
    if (!this.$userList) return;

    try {
      const users = await api.getUsers();
      this.$userList.innerHTML = users.map(u => {
        const escaped = this.escapeHtml(u.username);
        const adminBadge = u.is_admin ? ' <span class="text-accent text-xs">(admin)</span>' : '';
        return `<div class="py-2 border-b border-border last:border-b-0">${escaped}${adminBadge} <span class="text-text-muted text-xs">(created ${new Date(u.created_at).toLocaleDateString()})</span></div>`;
      }).join('');
    } catch {
      this.$userList.innerHTML = '<div class="text-text-muted">Failed to load users</div>';
    }
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // No cleanup needed - inherits empty exit() from BaseScreen
}
