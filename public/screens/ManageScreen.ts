import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * Manage screen - shows list of workout days to manage.
 */
export class ManageScreen extends BaseScreen {
  readonly id = 'manage-screen';
  readonly route = '/manage';

  private get $manageDayButtons() {
    return document.getElementById('manage-day-buttons');
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
    const state = this.ctx.getState();

    // Render day buttons
    if (this.$manageDayButtons) {
      if (state.days.length === 0) {
        this.$manageDayButtons.innerHTML = '<p class="p-4 text-text-muted text-center">No workout days yet</p>';
      } else {
        this.$manageDayButtons.innerHTML = state.days.map(d => templates.renderManageDayButton(d)).join('');
      }
    }

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
