<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import { navigate, goBack } from '../lib/store.svelte';
  import { darkThemeOptions } from '../lib/chart-helpers';
  import { MEASUREMENT_FIELDS } from '../lib/types';
  import type { BodyMeasurement, MeasurementFieldConfig } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  declare const Chart: any;

  let measurements = $state<BodyMeasurement[]>([]);
  let loading = $state(true);
  let chartInstances: any[] = [];

  // Modal state
  let modalOpen = $state(false);
  let editingId = $state<number | null>(null);
  let formData = $state<Record<string, number | string | null>>({});

  // Group fields by section
  const mainFields = MEASUREMENT_FIELDS.filter(f => f.section === 'main');
  const upperFields = MEASUREMENT_FIELDS.filter(f => f.section === 'upper');
  const coreFields = MEASUREMENT_FIELDS.filter(f => f.section === 'core');
  const lowerFields = MEASUREMENT_FIELDS.filter(f => f.section === 'lower');

  // Muscles increase = good, waist/hips decrease = good
  const inverseFields = new Set<string>(['waist', 'hips']);
  const neutralFields = new Set<string>(['weight']);

  onMount(() => { load(); });

  async function load() {
    destroyCharts();
    loading = true;
    try {
      measurements = await api.getMeasurements();
    } catch (err) {
      console.error('Failed to load measurements', err);
    }
    loading = false;

    await tick();
    renderCharts();
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

  function getLatestValue(key: keyof BodyMeasurement): number | null {
    for (const m of measurements) {
      const val = m[key];
      if (val !== null && val !== undefined && typeof val === 'number') return val;
    }
    return null;
  }

  function getMonthlyChange(key: keyof BodyMeasurement): { change: number; hasData: boolean } | null {
    const now = new Date();
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());

    let latestVal: number | null = null;
    let priorVal: number | null = null;

    for (const m of measurements) {
      const val = m[key];
      if (val === null || val === undefined || typeof val !== 'number') continue;

      const date = new Date(m.measured_at);
      if (latestVal === null) {
        latestVal = val;
      }
      if (date <= monthAgo && priorVal === null) {
        priorVal = val;
      }
    }

    if (latestVal === null) return null;
    if (priorVal === null) return { change: 0, hasData: false };

    return { change: +(latestVal - priorVal).toFixed(1), hasData: true };
  }

  function getChangeColor(key: string, change: number): string {
    if (change === 0) return 'text-text-muted';
    if (neutralFields.has(key)) return 'text-accent';
    if (inverseFields.has(key)) {
      return change < 0 ? 'text-accent' : 'text-danger';
    }
    return change > 0 ? 'text-accent' : 'text-danger';
  }

  function renderCharts() {
    for (const field of MEASUREMENT_FIELDS) {
      const dataPoints = measurements
        .filter(m => {
          const val = m[field.key];
          return val !== null && val !== undefined && typeof val === 'number';
        })
        .reverse();

      if (dataPoints.length < 2) continue;

      const canvas = document.getElementById(`measurement-chart-${field.key}`) as HTMLCanvasElement | null;
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dataPoints.map(d => new Date(d.measured_at)),
          datasets: [{
            data: dataPoints.map(d => d[field.key] as number),
            borderColor: field.color,
            backgroundColor: field.color + '1a',
            fill: true,
            tension: 0.3,
            pointRadius: 3,
            pointBackgroundColor: field.color,
            borderWidth: 2,
          }]
        },
        options: {
          ...darkThemeOptions,
          plugins: {
            ...darkThemeOptions.plugins,
            title: {
              ...darkThemeOptions.plugins.title,
              text: `${field.label} (${field.unit})`,
            }
          },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'week' },
              ticks: { color: '#666666', font: { family: 'Outfit', size: 10 }, maxTicksLimit: 6 },
              grid: { color: '#222222' }
            },
            y: {
              ticks: { color: '#666666', font: { family: 'Outfit', size: 11 } },
              grid: { color: '#222222' }
            }
          }
        }
      });
      chartInstances.push(chart);
    }
  }

  function openAddModal() {
    editingId = null;
    formData = {
      measured_at: new Date().toISOString().split('T')[0],
      notes: '',
    };
    for (const field of MEASUREMENT_FIELDS) {
      formData[field.key as string] = null;
    }
    modalOpen = true;
  }

  function openEditModal(measurement: BodyMeasurement) {
    editingId = measurement.id;
    formData = {
      measured_at: measurement.measured_at.split('T')[0],
      notes: measurement.notes || '',
    };
    for (const field of MEASUREMENT_FIELDS) {
      formData[field.key as string] = measurement[field.key] as number | null;
    }
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingId = null;
  }

  async function saveMeasurement() {
    const payload: Record<string, any> = {
      measured_at: new Date(formData.measured_at as string + 'T12:00:00').toISOString(),
      notes: (formData.notes as string) || null,
    };

    for (const field of MEASUREMENT_FIELDS) {
      const val = formData[field.key as string];
      payload[field.key as string] = val !== null && val !== undefined && val !== '' ? Number(val) : null;
    }

    try {
      if (editingId) {
        await api.updateMeasurement(editingId, payload);
      } else {
        await api.createMeasurement(payload as any);
      }
      closeModal();
      await load();
    } catch (err) {
      alert('Failed to save measurement');
      console.error(err);
    }
  }

  function formatMeasurementDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const day = dayNames[d.getDay()];
    return `${day}, ${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }

  function getWeightChange(index: number): number | null {
    if (index >= measurements.length - 1) return null;
    const current = measurements[index].weight;
    const previous = measurements[index + 1].weight;
    if (current === null || previous === null) return null;
    return +(current - previous).toFixed(1);
  }

  function countOtherFields(m: BodyMeasurement): number {
    let count = 0;
    for (const field of MEASUREMENT_FIELDS) {
      if (field.key === 'weight') continue;
      if (m[field.key] !== null && m[field.key] !== undefined) count++;
    }
    return count;
  }

  function fieldsWithData(field: MeasurementFieldConfig): boolean {
    const dataPoints = measurements.filter(m => {
      const val = m[field.key];
      return val !== null && val !== undefined && typeof val === 'number';
    });
    return dataPoints.length >= 2;
  }

  let hasAnyCharts = $derived(MEASUREMENT_FIELDS.some(f => fieldsWithData(f)));

  onDestroy(() => {
    destroyCharts();
  });
</script>

<div id="measurements-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">Body Measurements</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    <div id="measurements-summary">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else}
      <!-- Summary cards -->
      {#if measurements.length > 0}
        <section class="mb-6">
          <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Current</h2>
          <div class="grid grid-cols-2 gap-2">
            {#each MEASUREMENT_FIELDS as field}
              {@const latest = getLatestValue(field.key)}
              {#if latest !== null}
                {@const monthChange = getMonthlyChange(field.key)}
                <div class="bg-surface border border-border rounded-lg p-3">
                  <div class="text-xs text-text-muted mb-1">{field.label}</div>
                  <div class="text-lg font-semibold text-text-primary">
                    {latest}<span class="text-sm text-text-muted ml-1">{field.unit}</span>
                  </div>
                  {#if monthChange}
                    {#if monthChange.hasData}
                      {#if monthChange.change !== 0}
                        <div class="text-xs mt-1 {getChangeColor(field.key as string, monthChange.change)}">
                          {monthChange.change > 0 ? '+' : ''}{monthChange.change} this month
                        </div>
                      {:else}
                        <div class="text-xs mt-1 text-text-muted">No change this month</div>
                      {/if}
                    {:else}
                      <div class="text-xs mt-1 text-text-muted italic">No prior data this month</div>
                    {/if}
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        </section>
      {/if}

      <!-- Add button -->
      <button
        class="w-full p-3 mb-6 bg-surface border border-border rounded-lg text-accent font-medium text-sm"
        onclick={openAddModal}
      >
        + Add Measurement
      </button>

      <!-- Charts -->
      {#if hasAnyCharts}
        <section id="measurements-charts" class="mb-6">
          <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Trends</h2>
          {#each MEASUREMENT_FIELDS as field}
            {#if fieldsWithData(field)}
              <div class="bg-surface border border-border rounded-lg p-3 h-48 mb-3">
                <canvas id="measurement-chart-{field.key}"></canvas>
              </div>
            {/if}
          {/each}
        </section>
      {/if}

      <!-- History -->
      <div id="measurements-history">
      {#if measurements.length > 0}
        <section>
          <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">History</h2>
          <div class="flex flex-col gap-2">
            {#each measurements as measurement, i}
              <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
              <div
                class="bg-surface border border-border rounded-lg p-4 active:bg-surface-elevated cursor-pointer"
                onclick={() => navigate('measurement-detail', { id: String(measurement.id) })}
              >
                <div class="flex items-center justify-between mb-1">
                  <span class="font-semibold text-text-primary text-sm">{formatMeasurementDate(measurement.measured_at)}</span>
                  {#if countOtherFields(measurement) > 0}
                    <span class="text-xs text-text-muted">+{countOtherFields(measurement)} measurements</span>
                  {/if}
                </div>
                {#if measurement.weight !== null}
                  {@const change = getWeightChange(i)}
                  <div class="flex items-center gap-2">
                    <span class="text-text-secondary text-sm">{measurement.weight} kg</span>
                    {#if change !== null && change !== 0}
                      <span class="text-xs {change > 0 ? 'text-accent' : 'text-danger'}">
                        {change > 0 ? '+' : ''}{change}
                      </span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/if}
      </div>
    {/if}
    </div>
  </main>
</div>

<!-- Add/Edit Measurement Modal -->
<Modal open={modalOpen} onclose={closeModal}>
  <h3 class="text-lg font-semibold mb-4">{editingId ? 'Edit Measurement' : 'Add Measurement'}</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Date
    <input
      type="date"
      bind:value={formData.measured_at}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <!-- Main (Weight) -->
  <div class="mb-4">
    <h4 class="text-xs uppercase tracking-wider text-text-muted mb-2 font-medium">Weight</h4>
    {#each mainFields as field}
      <label class="flex items-center justify-between gap-2 text-sm text-text-secondary mb-2">
        <span>{field.label} <span class="text-text-muted">({field.unit})</span></span>
        <input
          type="number"
          step="0.1"
          bind:value={formData[field.key]}
          placeholder="--"
          class="w-24 p-2 bg-black border border-border rounded-lg text-right text-text-primary focus:outline-none focus:border-accent"
        />
      </label>
    {/each}
  </div>

  <!-- Upper Body -->
  <div class="mb-4">
    <h4 class="text-xs uppercase tracking-wider text-text-muted mb-2 font-medium">Upper Body</h4>
    {#each upperFields as field}
      <label class="flex items-center justify-between gap-2 text-sm text-text-secondary mb-2">
        <span>{field.label} <span class="text-text-muted">({field.unit})</span></span>
        <input
          type="number"
          step="0.1"
          bind:value={formData[field.key]}
          placeholder="--"
          class="w-24 p-2 bg-black border border-border rounded-lg text-right text-text-primary focus:outline-none focus:border-accent"
        />
      </label>
    {/each}
  </div>

  <!-- Core -->
  <div class="mb-4">
    <h4 class="text-xs uppercase tracking-wider text-text-muted mb-2 font-medium">Core</h4>
    {#each coreFields as field}
      <label class="flex items-center justify-between gap-2 text-sm text-text-secondary mb-2">
        <span>{field.label} <span class="text-text-muted">({field.unit})</span></span>
        <input
          type="number"
          step="0.1"
          bind:value={formData[field.key]}
          placeholder="--"
          class="w-24 p-2 bg-black border border-border rounded-lg text-right text-text-primary focus:outline-none focus:border-accent"
        />
      </label>
    {/each}
  </div>

  <!-- Lower Body -->
  <div class="mb-4">
    <h4 class="text-xs uppercase tracking-wider text-text-muted mb-2 font-medium">Lower Body</h4>
    {#each lowerFields as field}
      <label class="flex items-center justify-between gap-2 text-sm text-text-secondary mb-2">
        <span>{field.label} <span class="text-text-muted">({field.unit})</span></span>
        <input
          type="number"
          step="0.1"
          bind:value={formData[field.key]}
          placeholder="--"
          class="w-24 p-2 bg-black border border-border rounded-lg text-right text-text-primary focus:outline-none focus:border-accent"
        />
      </label>
    {/each}
  </div>

  <!-- Notes -->
  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Notes
    <textarea
      bind:value={formData.notes}
      rows="2"
      placeholder="Optional notes..."
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent resize-none"
    ></textarea>
  </label>

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeModal}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={saveMeasurement}
    >
      Save
    </button>
  </div>
</Modal>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
