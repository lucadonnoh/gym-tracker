<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, navigate, goBack } from '../lib/store.svelte';
  import type { User, WorkoutDay } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let days = $state<WorkoutDay[]>([]);
  let loading = $state(true);

  // Add day modal
  let addDayOpen = $state(false);
  let newDayDisplayName = $state('');
  let addingDay = $state(false);

  // Admin
  let users = $state<User[]>([]);
  let newUsername = $state('');
  let addingUser = $state(false);

  let slugName = $derived(
    newDayDisplayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      days = await api.getDays();
      if (appState.currentUser?.is_admin) {
        users = await api.getUsers();
      }
    } catch (err) {
      console.error('Failed to load manage data', err);
    }
    loading = false;
  }

  function openAddDay() {
    newDayDisplayName = '';
    addingDay = false;
    addDayOpen = true;
  }

  function closeAddDay() {
    addDayOpen = false;
  }

  async function handleAddDay() {
    if (!newDayDisplayName.trim() || !slugName) return;
    addingDay = true;
    try {
      const result = await api.createDay(slugName, newDayDisplayName.trim());
      if ('error' in result) {
        alert(result.error);
        addingDay = false;
        return;
      }
      days = await api.getDays();
      appState.days = days;
      closeAddDay();
      navigate('manage-day', { id: String(result.id) });
    } catch (err) {
      alert('Failed to create day');
      console.error(err);
      addingDay = false;
    }
  }

  async function handleAddUser() {
    if (!newUsername.trim()) return;
    addingUser = true;
    try {
      await api.createUser(newUsername.trim());
      newUsername = '';
      users = await api.getUsers();
    } catch (err) {
      alert('Failed to add user');
      console.error(err);
    }
    addingUser = false;
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
</script>

<div id="manage-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">Manage</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    <div id="manage-exercise-list">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else}
      <!-- Workout Days -->
      <section class="mb-6">
        <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Workout Days</h2>
        <div class="bg-surface border border-border rounded-lg overflow-hidden mb-3">
          {#each days as day}
            <button
              class="w-full px-4 py-3 text-left flex items-center justify-between border-b border-border last:border-b-0 active:bg-surface-elevated"
              onclick={() => navigate('manage-day', { id: String(day.id) })}
            >
              <span class="font-semibold text-text-primary">{day.display_name}</span>
              <span class="text-text-muted text-sm">&#8250;</span>
            </button>
          {/each}
        </div>
        <button
          id="add-day-btn"
          class="w-full p-3 bg-surface border border-border rounded-lg text-accent font-medium text-sm"
          onclick={openAddDay}
        >
          + Add Workout Day
        </button>
      </section>

      <!-- Admin Section -->
      {#if appState.currentUser?.is_admin}
        <section class="mb-6">
          <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Admin</h2>

          <div class="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="New username"
              bind:value={newUsername}
              class="flex-1 p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
            />
            <button
              class="px-4 py-3 bg-accent text-black font-semibold rounded-lg text-sm"
              onclick={handleAddUser}
              disabled={addingUser || !newUsername.trim()}
            >
              {addingUser ? '...' : 'Add User'}
            </button>
          </div>

          <div class="bg-surface border border-border rounded-lg overflow-hidden">
            {#each users as user}
              <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
                <div class="flex items-center gap-2">
                  <span class="text-text-primary text-sm font-medium">{user.username}</span>
                  {#if user.is_admin}
                    <span class="text-xs px-1.5 py-0.5 rounded font-medium bg-gold/20 text-gold">admin</span>
                  {/if}
                </div>
                <span class="text-text-muted text-xs">{formatDate(user.created_at)}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {/if}
    </div>
  </main>
</div>

<!-- Add Day Modal -->
<Modal open={addDayOpen} onclose={closeAddDay} id="day-modal">
  <h3 class="text-lg font-semibold mb-4">Add Workout Day</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-2">
    Display Name
    <input
      type="text"
      bind:value={newDayDisplayName}
      placeholder="e.g. Push Day"
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  {#if slugName}
    <div class="text-xs text-text-muted mb-4">Slug: {slugName}</div>
  {/if}

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeAddDay}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={handleAddDay}
      disabled={addingDay || !newDayDisplayName.trim()}
    >
      {addingDay ? 'Creating...' : 'Create'}
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
