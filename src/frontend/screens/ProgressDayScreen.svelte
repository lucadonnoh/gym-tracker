<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import { goBack } from '../lib/store.svelte';
  import { darkThemeOptions } from '../lib/chart-helpers';
  import type { Exercise, ProgressData } from '../lib/types';

  declare const Chart: any;

  let { params } = $props<{ params: Record<string, string> }>();

  let dayId = $derived(Number(params.id));
  let exercises = $state<Exercise[]>([]);
  let progressMap = $state<Map<number, ProgressData[]>>(new Map());
  let loading = $state(true);
  let dayName = $state('');
  let chartInstances: any[] = [];

  onMount(() => { load(); });

  async function load() {
    destroyCharts();
    loading = true;

    try {
      exercises = await api.getDayExercises(dayId);

      if (exercises.length > 0 && exercises[0].day_display_name) {
        dayName = exercises[0].day_display_name;
      }

      const map = new Map<number, ProgressData[]>();
      for (const ex of exercises) {
        const data = await api.getProgress(ex.id);
        map.set(ex.id, data);
      }
      progressMap = map;
    } catch (err) {
      console.error('Failed to load progress data', err);
    }

    loading = false;

    // Wait for DOM to update, then render charts
    await tick();
    renderCharts();

    if (params.exerciseId) {
      scrollToExercise(params.exerciseId);
    }
  }

  function tick(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  function destroyCharts() {
    for (const chart of chartInstances) {
      chart.destroy();
    }
    chartInstances = [];
  }

  function renderCharts() {
    for (const ex of exercises) {
      const data = progressMap.get(ex.id);
      if (!data || data.length < 2) continue;

      const labels = data.map(d => d.date);

      // Max Weight chart
      const weightCanvas = document.getElementById(`weight-chart-${ex.id}`) as HTMLCanvasElement | null;
      if (weightCanvas) {
        const ctx = weightCanvas.getContext('2d');
        if (ctx) {
          const chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                data: data.map(d => d.maxWeight),
                borderColor: '#22c55e',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#22c55e',
                borderWidth: 2,
              }]
            },
            options: {
              ...darkThemeOptions,
              plugins: {
                ...darkThemeOptions.plugins,
                title: {
                  ...darkThemeOptions.plugins.title,
                  text: 'Max Weight (kg)',
                }
              }
            }
          });
          chartInstances.push(chart);
        }
      }

      // Total Reps chart
      const repsCanvas = document.getElementById(`reps-chart-${ex.id}`) as HTMLCanvasElement | null;
      if (repsCanvas) {
        const ctx = repsCanvas.getContext('2d');
        if (ctx) {
          const chart = new Chart(ctx, {
            type: 'line',
            data: {
              labels,
              datasets: [{
                data: data.map(d => d.totalReps),
                borderColor: '#818cf8',
                backgroundColor: 'rgba(129, 140, 248, 0.1)',
                fill: true,
                tension: 0.3,
                pointRadius: 3,
                pointBackgroundColor: '#818cf8',
                borderWidth: 2,
              }]
            },
            options: {
              ...darkThemeOptions,
              plugins: {
                ...darkThemeOptions.plugins,
                title: {
                  ...darkThemeOptions.plugins.title,
                  text: 'Total Reps',
                }
              }
            }
          });
          chartInstances.push(chart);
        }
      }
    }
  }

  function scrollToExercise(exerciseId: string) {
    requestAnimationFrame(() => {
      const el = document.getElementById(`exercise-progress-${exerciseId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  onDestroy(() => {
    destroyCharts();
  });
</script>

<div id="progress-day-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">{dayName || 'Progress'}</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else if exercises.length === 0}
      <div class="text-center text-text-muted py-8">No exercises found</div>
    {:else}
      <div id="progress-charts">
      {#each exercises as exercise}
        <div id="exercise-progress-{exercise.id}" class="mb-8">
          <h2 class="text-base font-semibold text-text-primary mb-3">{exercise.name}</h2>

          {#if (progressMap.get(exercise.id)?.length ?? 0) < 2}
            <p class="text-sm text-text-muted">Not enough data yet</p>
          {:else}
            <div class="grid grid-cols-1 gap-4">
              <div class="bg-surface border border-border rounded-lg p-3 h-48">
                <canvas id="weight-chart-{exercise.id}"></canvas>
              </div>
              <div class="bg-surface border border-border rounded-lg p-3 h-48">
                <canvas id="reps-chart-{exercise.id}"></canvas>
              </div>
            </div>
          {/if}
        </div>
      {/each}
      </div>
    {/if}
  </main>
</div>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
