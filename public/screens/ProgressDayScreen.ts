import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';

// Chart.js is loaded via script tag
declare const Chart: any;

/**
 * Progress Day screen - shows progress charts for a specific workout day.
 */
export class ProgressDayScreen extends BaseScreen {
  readonly id = 'progress-day-screen';
  readonly route = '/progress/:id';

  private dayId: number | null = null;

  private get $progressDayTitle() {
    return document.getElementById('progress-day-title');
  }

  private get $progressCharts() {
    return document.getElementById('progress-charts');
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

    if (this.$progressDayTitle) {
      this.$progressDayTitle.textContent = day?.display_name || 'Progress';
    }

    await this.loadCharts();
  }

  async loadCharts(): Promise<void> {
    if (!this.dayId || !this.$progressCharts) return;

    // Get all exercises for this day
    const exercises = await api.getDayExercises(this.dayId);

    if (exercises.length === 0) {
      this.$progressCharts.innerHTML = '<p class="text-center text-text-muted py-8">No exercises for this day</p>';
      return;
    }

    // Destroy old charts
    this.destroyCharts();

    // Create container for each exercise
    this.$progressCharts.innerHTML = exercises.map(ex => `
      <div class="bg-surface border border-border rounded-lg p-4 mb-4" id="progress-exercise-${ex.id}">
        <h3 class="font-semibold text-text-primary mb-3">${ex.name}</h3>
        <div class="progress-charts-container grid gap-4">
          <div class="h-[150px]"><canvas id="weight-chart-${ex.id}"></canvas></div>
          <div class="h-[150px]"><canvas id="reps-chart-${ex.id}"></canvas></div>
        </div>
      </div>
    `).join('');

    // Load progress data and render charts for each exercise
    for (const exercise of exercises) {
      const data = await api.getProgress(exercise.id);
      if (data.length > 0) {
        this.renderExerciseCharts(exercise.id, data);
      } else {
        const container = document.getElementById(`progress-exercise-${exercise.id}`);
        const chartsDiv = container?.querySelector('.progress-charts-container');
        if (chartsDiv) {
          chartsDiv.innerHTML = '<p class="text-center text-text-muted py-4">No data yet</p>';
        }
      }
    }
  }

  private destroyCharts(): void {
    // Charts are stored in the inherited this.charts array
    // They will be cleaned up by BaseScreen.exit(), but we also
    // need to clear them when loading new day
    for (const chart of this.charts) {
      chart.destroy();
    }
    this.charts = [];
  }

  private renderExerciseCharts(exerciseId: number, data: { date: string; maxWeight: number; totalReps: number }[]): void {
    const labels = data.map(d => d.date);
    const weights = data.map(d => d.maxWeight);
    const reps = data.map(d => d.totalReps);

    const darkThemeOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          color: '#888888',
          font: { family: 'Outfit', weight: '500' as const, size: 12 }
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          ticks: { color: '#666666', font: { family: 'Outfit', size: 11 } },
          grid: { color: '#222222' }
        }
      }
    };

    // Weight chart
    const weightCtx = document.getElementById(`weight-chart-${exerciseId}`) as HTMLCanvasElement;
    if (weightCtx) {
      const weightChart = new Chart(weightCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: weights,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            title: { ...darkThemeOptions.plugins.title, text: 'Max Weight (kg)' }
          }
        }
      });
      this.charts.push(weightChart);
    }

    // Reps chart
    const repsCtx = document.getElementById(`reps-chart-${exerciseId}`) as HTMLCanvasElement;
    if (repsCtx) {
      const repsChart = new Chart(repsCtx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            data: reps,
            borderColor: '#818cf8',
            backgroundColor: 'rgba(129, 140, 248, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            title: { ...darkThemeOptions.plugins.title, text: 'Total Reps' }
          }
        }
      });
      this.charts.push(repsChart);
    }
  }

  scrollToExercise(exerciseId: number): void {
    setTimeout(() => {
      const chartEl = document.getElementById(`progress-exercise-${exerciseId}`);
      chartEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  getDayId(): number | null {
    return this.dayId;
  }

  exit(): void {
    this.dayId = null;
    super.exit(); // BaseScreen.exit() handles chart cleanup
  }
}
