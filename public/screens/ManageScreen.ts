import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';

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
  }

  // No cleanup needed - inherits empty exit() from BaseScreen
}
