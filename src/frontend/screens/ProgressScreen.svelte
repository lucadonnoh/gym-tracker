<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, navigate, goBack } from '../lib/store.svelte';
  import type { WorkoutDay } from '../lib/types';

  let days = $state<WorkoutDay[]>([]);
  let loading = $state(true);

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      days = await api.getDays();
    } catch (err) {
      console.error('Failed to load days', err);
    }
    loading = false;
  }
</script>

<div id="progress-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">Progress</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    <div id="progress-charts">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else if days.length === 0}
      <div class="text-center text-text-muted py-8">No workout days yet</div>
    {:else}
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        {#each days as day}
          <button
            class="w-full px-4 py-3 text-left flex items-center justify-between border-b border-border last:border-b-0 active:bg-surface-elevated"
            onclick={() => navigate('progress-day', { id: String(day.id) })}
          >
            <span class="font-semibold text-text-primary">{day.display_name}</span>
            <span class="text-text-muted text-sm">&#8250;</span>
          </button>
        {/each}
      </div>
    {/if}
    </div>
  </main>
</div>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
