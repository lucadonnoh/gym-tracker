<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { goBack } from '../lib/store.svelte';
  import { MEASUREMENT_FIELDS } from '../lib/types';
  import type { BodyMeasurement } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let { params } = $props<{ params: Record<string, string> }>();

  let measurementId = $derived(Number(params.id));
  let measurement = $state<BodyMeasurement | null>(null);
  let loading = $state(true);

  // Edit modal state
  let modalOpen = $state(false);
  let formData = $state<Record<string, number | string | null>>({});

  // Group fields by section for the edit modal
  const mainFields = MEASUREMENT_FIELDS.filter(f => f.section === 'main');
  const upperFields = MEASUREMENT_FIELDS.filter(f => f.section === 'upper');
  const coreFields = MEASUREMENT_FIELDS.filter(f => f.section === 'core');
  const lowerFields = MEASUREMENT_FIELDS.filter(f => f.section === 'lower');

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      measurement = await api.getMeasurement(measurementId);
    } catch (err) {
      console.error('Failed to load measurement', err);
    }
    loading = false;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dayNames[d.getDay()]}, ${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }

  function getDisplayFields(): { label: string; value: string }[] {
    if (!measurement) return [];
    const fields: { label: string; value: string }[] = [];
    for (const field of MEASUREMENT_FIELDS) {
      const val = measurement[field.key];
      if (val !== null && val !== undefined) {
        fields.push({ label: field.label, value: `${val} ${field.unit}` });
      }
    }
    return fields;
  }

  let displayFields = $derived(getDisplayFields());

  function openEditModal() {
    if (!measurement) return;
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
  }

  async function saveMeasurement() {
    if (!measurement) return;

    const payload: Record<string, any> = {
      measured_at: new Date(formData.measured_at as string + 'T12:00:00').toISOString(),
      notes: (formData.notes as string) || null,
    };

    for (const field of MEASUREMENT_FIELDS) {
      const val = formData[field.key as string];
      payload[field.key as string] = val !== null && val !== undefined && val !== '' ? Number(val) : null;
    }

    try {
      await api.updateMeasurement(measurement.id, payload);
      closeModal();
      await load();
    } catch (err) {
      alert('Failed to save measurement');
      console.error(err);
    }
  }

  async function deleteMeasurement() {
    if (!measurement) return;
    if (!confirm('Delete this measurement? This cannot be undone.')) return;

    try {
      await api.deleteMeasurement(measurement.id);
      goBack();
    } catch (err) {
      alert('Failed to delete measurement');
      console.error(err);
    }
  }
</script>

<div id="measurement-detail-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">
      {#if measurement}
        {formatDate(measurement.measured_at)}
      {:else}
        Measurement
      {/if}
    </h1>
    <button
      class="text-danger text-sm font-medium"
      onclick={deleteMeasurement}
    >
      Delete
    </button>
  </header>

  <main class="p-4">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else if !measurement}
      <div class="text-center text-text-muted py-8">Measurement not found</div>
    {:else}
      <!-- Measurement fields -->
      {#if displayFields.length > 0}
        <div class="bg-surface border border-border rounded-lg overflow-hidden mb-4">
          {#each displayFields as field, i}
            <div class="flex items-center justify-between px-4 py-3 {i < displayFields.length - 1 ? 'border-b border-border' : ''}">
              <span class="text-text-secondary text-sm">{field.label}</span>
              <span class="text-text-primary font-medium">{field.value}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="text-center text-text-muted py-4 mb-4">No measurements recorded</div>
      {/if}

      <!-- Notes -->
      {#if measurement.notes}
        <div class="bg-surface border border-border rounded-lg p-4 mb-4">
          <div class="text-xs uppercase tracking-wider text-text-muted mb-2 font-medium">Notes</div>
          <p class="text-text-secondary text-sm">{measurement.notes}</p>
        </div>
      {/if}

      <!-- Edit button -->
      <button
        class="w-full p-3 bg-surface border border-border rounded-lg text-accent font-medium text-sm"
        onclick={openEditModal}
      >
        Edit Measurement
      </button>
    {/if}
  </main>
</div>

<!-- Edit Measurement Modal -->
<Modal open={modalOpen} onclose={closeModal}>
  <h3 class="text-lg font-semibold mb-4">Edit Measurement</h3>

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
