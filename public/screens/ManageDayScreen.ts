import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * Manage Day screen - shows exercises for a specific workout day.
 */
export class ManageDayScreen extends BaseScreen {
  readonly id = 'manage-day-screen';
  readonly route = '/manage/:id';

  private dayId: number | null = null;

  private get $manageDayTitle() {
    return document.getElementById('manage-day-title');
  }

  private get $manageExerciseList() {
    return document.getElementById('manage-exercise-list');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(params: RouteParams): Promise<void> {
    this.dayId = params.id ? parseInt(params.id) : null;

    if (!this.dayId) {
      this.ctx.goBack();
      return;
    }

    const state = this.ctx.getState();
    const day = state.days.find(d => d.id === this.dayId);

    if (this.$manageDayTitle) {
      this.$manageDayTitle.textContent = day?.display_name || 'Exercises';
    }

    await this.loadExercises();
  }

  async loadExercises(): Promise<void> {
    if (!this.dayId || !this.$manageExerciseList) return;

    const exercises = await api.getDayExercises(this.dayId);

    if (exercises.length === 0) {
      this.$manageExerciseList.innerHTML = '<p class="text-text-muted text-center py-4">No exercises yet</p>';
    } else {
      this.$manageExerciseList.innerHTML = exercises.map(ex => templates.renderManageExercise(ex)).join('');
    }
  }

  getDayId(): number | null {
    return this.dayId;
  }

  exit(): void {
    this.dayId = null;
    super.exit();
  }
}
