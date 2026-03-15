<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, goBack } from '../lib/store.svelte';
  import { parseDescriptionToGroups, generateDescription } from '../lib/utils';
  import type { Exercise, SetGroup } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let { params } = $props<{ params: Record<string, string> }>();

  let exercises = $state<Exercise[]>([]);
  let loading = $state(true);
  let dayTitle = $state('');

  let dayId = $derived(Number(params.id));

  // Exercise modal (shared for add/edit)
  let exerciseModalOpen = $state(false);
  let editingExercise = $state<Exercise | null>(null);
  let exerciseName = $state('');
  let exerciseDefaultWeight = $state('');
  let setGroups = $state<SetGroup[]>([{ count: 3, reps: 10, isDropset: false }]);
  let savingExercise = $state(false);

  // Rename modal
  let renameModalOpen = $state(false);
  let renameValue = $state('');
  let renaming = $state(false);

  let descriptionPreview = $derived(generateDescription(setGroups));

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      const day = appState.days.find(d => d.id === dayId);
      dayTitle = day?.display_name ?? 'Workout Day';
      exercises = await api.getDayExercises(dayId);
    } catch (err) {
      console.error('Failed to load day exercises', err);
    }
    loading = false;
  }

  function openAddExercise() {
    editingExercise = null;
    exerciseName = '';
    exerciseDefaultWeight = '';
    setGroups = [{ count: 3, reps: 10, isDropset: false }];
    savingExercise = false;
    exerciseModalOpen = true;
  }

  function openEditExercise(exercise: Exercise) {
    editingExercise = exercise;
    exerciseName = exercise.name;
    exerciseDefaultWeight = exercise.default_weight != null ? String(exercise.default_weight) : '';
    setGroups = parseDescriptionToGroups(exercise.description);
    savingExercise = false;
    exerciseModalOpen = true;
  }

  function closeExerciseModal() {
    exerciseModalOpen = false;
  }

  async function handleSaveExercise() {
    if (!exerciseName.trim()) return;
    savingExercise = true;

    const description = generateDescription(setGroups);
    const weight = exerciseDefaultWeight.trim() ? Number(exerciseDefaultWeight) : null;

    try {
      if (editingExercise) {
        await api.updateExercise(editingExercise.id, exerciseName.trim(), description, weight);
      } else {
        await api.createExercise(dayId, exerciseName.trim(), description, weight);
      }
      exercises = await api.getDayExercises(dayId);
      closeExerciseModal();
    } catch (err) {
      alert('Failed to save exercise');
      console.error(err);
      savingExercise = false;
    }
  }

  async function handleDeleteExercise(exercise: Exercise) {
    if (!confirm(`Delete "${exercise.name}"?`)) return;
    try {
      await api.deleteExercise(exercise.id);
      exercises = await api.getDayExercises(dayId);
    } catch (err) {
      alert('Failed to delete exercise');
      console.error(err);
    }
  }

  // Set group builders
  function addSetGroup() {
    setGroups = [...setGroups, { count: 3, reps: 10, isDropset: false }];
  }

  function removeSetGroup(index: number) {
    setGroups = setGroups.filter((_, i) => i !== index);
    if (setGroups.length === 0) {
      setGroups = [{ count: 3, reps: 10, isDropset: false }];
    }
  }

  function updateGroupCount(index: number, value: string) {
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) {
      setGroups[index].count = num;
    }
  }

  function updateGroupReps(index: number, value: string) {
    const num = parseInt(value);
    if (!isNaN(num) && num > 0) {
      setGroups[index].reps = num;
    }
  }

  function toggleMaxReps(index: number) {
    if (setGroups[index].reps === 'max') {
      setGroups[index].reps = 10;
    } else {
      setGroups[index].reps = 'max';
    }
  }

  function toggleDropset(index: number) {
    setGroups[index].isDropset = !setGroups[index].isDropset;
    if (setGroups[index].isDropset) {
      setGroups[index].dropsetCount = 2;
    } else {
      delete setGroups[index].dropsetCount;
    }
  }

  function updateDropsetCount(index: number, value: string) {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 2) {
      setGroups[index].dropsetCount = num;
    }
  }

  function updateMaxCount(index: number, value: string) {
    const num = parseInt(value);
    if (!isNaN(num) && num >= 0) {
      setGroups[index].maxCount = num || undefined;
    }
  }

  // Rename day
  function openRenameModal() {
    renameValue = dayTitle;
    renaming = false;
    renameModalOpen = true;
  }

  function closeRenameModal() {
    renameModalOpen = false;
  }

  async function handleRenameDay() {
    if (!renameValue.trim()) return;
    renaming = true;
    try {
      await api.updateDay(dayId, renameValue.trim());
      dayTitle = renameValue.trim();
      appState.days = await api.getDays();
      closeRenameModal();
    } catch (err) {
      alert('Failed to rename day');
      console.error(err);
      renaming = false;
    }
  }

  // Delete day
  async function handleDeleteDay() {
    if (!confirm(`Delete "${dayTitle}" and all its exercises?`)) return;
    try {
      await api.deleteDay(dayId);
      appState.days = await api.getDays();
      goBack();
    } catch (err) {
      alert('Failed to delete day');
      console.error(err);
    }
  }
</script>

<div id="manage-day-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">{dayTitle}</h1>
    <div class="flex gap-2">
      <button
        class="text-text-secondary text-sm font-medium"
        onclick={openRenameModal}
      >
        Rename
      </button>
      <button
        class="text-danger text-sm font-medium"
        onclick={handleDeleteDay}
      >
        Delete
      </button>
    </div>
  </header>

  <main class="p-4">
    {#if loading}
      <div class="text-center text-text-muted py-8">Loading...</div>
    {:else if exercises.length === 0}
      <div class="text-center text-text-muted py-8">No exercises yet</div>
    {:else}
      <div id="manage-exercise-list" class="flex flex-col gap-2 mb-4">
        {#each exercises as exercise}
          <div class="bg-surface border border-border rounded-lg p-4">
            <div class="flex items-start justify-between mb-1">
              <div>
                <div class="font-semibold text-text-primary">{exercise.name}</div>
                {#if exercise.description}
                  <div class="text-sm text-text-secondary mt-0.5">{exercise.description}</div>
                {/if}
                {#if exercise.default_weight != null}
                  <div class="text-xs text-text-muted mt-0.5">{exercise.default_weight} kg</div>
                {/if}
              </div>
              <div class="flex gap-2">
                <button
                  class="px-3 py-1 bg-black border border-border text-text-secondary text-xs font-medium rounded-lg"
                  onclick={() => openEditExercise(exercise)}
                >
                  Edit
                </button>
                <button
                  class="px-3 py-1 bg-black border border-border text-danger text-xs font-medium rounded-lg"
                  onclick={() => handleDeleteExercise(exercise)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <button
      id="add-exercise-btn"
      class="w-full p-3 bg-surface border border-border rounded-lg text-accent font-medium text-sm"
      onclick={openAddExercise}
    >
      + Add Exercise
    </button>
  </main>
</div>

<!-- Exercise Modal (Add / Edit) -->
<Modal open={exerciseModalOpen} onclose={closeExerciseModal} id="exercise-modal">
  <h3 class="text-lg font-semibold mb-4">{editingExercise ? 'Edit Exercise' : 'Add Exercise'}</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    Name
    <input
      type="text"
      bind:value={exerciseName}
      placeholder="e.g. Bench Press"
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    Default Weight (kg)
    <input
      type="number"
      bind:value={exerciseDefaultWeight}
      placeholder="Optional"
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <!-- Set Groups Builder -->
  <div class="mb-3">
    <div class="text-sm text-text-secondary mb-2">Set Groups</div>
    <div class="flex flex-col gap-2">
      {#each setGroups as group, index}
        <div class="set-group">
          <div class="set-group-main">
            <input
              type="number"
              class="set-count"
              value={group.count}
              oninput={(e) => updateGroupCount(index, (e.target as HTMLInputElement).value)}
              min="1"
            />
            <span class="set-group-label">x</span>
            {#if group.reps === 'max'}
              <span class="set-reps-display">max</span>
            {:else}
              <input
                type="number"
                class="set-reps"
                value={group.reps}
                oninput={(e) => updateGroupReps(index, (e.target as HTMLInputElement).value)}
                min="1"
              />
            {/if}
            <button class="remove-set-group" onclick={() => removeSetGroup(index)} title="Remove group">
              &times;
            </button>
          </div>
          <div class="set-group-options">
            <label class="set-option">
              <input
                type="checkbox"
                checked={group.reps === 'max'}
                onchange={() => toggleMaxReps(index)}
              />
              Max reps
            </label>
            <label class="set-option">
              <input
                type="checkbox"
                checked={group.isDropset}
                onchange={() => toggleDropset(index)}
              />
              Dropset
            </label>
            {#if group.isDropset}
              <div class="flex items-center gap-1">
                <span class="option-label">drops:</span>
                <input
                  type="number"
                  class="option-input"
                  value={group.dropsetCount ?? 2}
                  oninput={(e) => updateDropsetCount(index, (e.target as HTMLInputElement).value)}
                  min="2"
                />
              </div>
            {/if}
            <div class="flex items-center gap-1">
              <span class="option-label">+max:</span>
              <input
                type="number"
                class="option-input"
                value={group.maxCount ?? 0}
                oninput={(e) => updateMaxCount(index, (e.target as HTMLInputElement).value)}
                min="0"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
    <button
      class="w-full mt-2 p-2 bg-black border border-border rounded-lg text-text-secondary text-sm font-medium"
      onclick={addSetGroup}
    >
      + Add Set Group
    </button>
  </div>

  <!-- Description Preview -->
  <div class="p-3 bg-black border border-border rounded-lg mb-4">
    <span class="text-xs text-text-muted">Preview: </span>
    <span class="text-sm text-accent font-medium">{descriptionPreview}</span>
  </div>

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeExerciseModal}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={handleSaveExercise}
      disabled={savingExercise || !exerciseName.trim()}
    >
      {savingExercise ? 'Saving...' : 'Save'}
    </button>
  </div>
</Modal>

<!-- Rename Day Modal -->
<Modal open={renameModalOpen} onclose={closeRenameModal}>
  <h3 class="text-lg font-semibold mb-4">Rename Day</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Display Name
    <input
      type="text"
      bind:value={renameValue}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closeRenameModal}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={handleRenameDay}
      disabled={renaming || !renameValue.trim()}
    >
      {renaming ? 'Saving...' : 'Save'}
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
