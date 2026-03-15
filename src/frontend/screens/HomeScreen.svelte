<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, navigate } from '../lib/store.svelte';
  import { daysAgoText } from '../lib/utils';
  import type { SummaryStats } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let stats = $state<SummaryStats | null>(null);
  let weeklyGoalOpen = $state(false);
  let loading = $state(true);

  onMount(() => { load(); });

  async function load() {
    try {
      stats = await api.getSummaryStats();
    } catch (err) {
      console.error('Failed to load summary stats', err);
    }
    loading = false;
  }

  async function startSession(dayId: number) {
    try {
      const result = await api.createSession(dayId);

      if ('error' in result && result.activeSession) {
        appState.currentSession = result.activeSession;
        navigate('session');
        return;
      }

      if ('error' in result) {
        throw new Error(result.error);
      }

      appState.currentSession = result;
      const day = appState.days.find(d => d.id === dayId);
      if (appState.currentSession && day) {
        appState.currentSession.day_display_name = day.display_name;
      }
      navigate('session');
    } catch (err) {
      alert('Failed to start session');
      console.error(err);
    }
  }

  function resumeSession() {
    navigate('session');
  }

  async function editWeeklyGoal() {
    weeklyGoalOpen = true;
  }

  async function setWeeklyGoal(goal: number) {
    try {
      await api.setWeeklyGoal(goal);
      weeklyGoalOpen = false;
      stats = await api.getSummaryStats();
    } catch (err) {
      alert('Failed to save weekly goal');
      console.error(err);
    }
  }

  // Derived data
  let weekDays = $derived.by(() => {
    if (!stats) return [];
    const workoutDays = stats.currentWeekWorkouts.map(w => w.dayOfWeek);
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const jsDays = [1, 2, 3, 4, 5, 6, 0];
    return dayLabels.map((label, i) => ({
      label,
      isCompleted: workoutDays.includes(jsDays[i]),
      isToday: new Date().getDay() === jsDays[i],
    }));
  });

  let weekComplete = $derived(stats ? stats.currentWeekWorkouts.length >= stats.weeklyGoal : false);
</script>

<div id="home-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <h1 class="text-lg font-semibold">Gym Tracker</h1>
    <button class="profile-btn w-9 h-9 flex items-center justify-center bg-transparent border border-border text-text-secondary rounded-sm text-lg relative"
      onclick={() => navigate('profile')}>
      👤
      {#if appState.pendingFriendRequestCount > 0}
        <span id="friend-request-badge" class="absolute -top-1 -right-1 w-5 h-5 bg-danger text-white text-xs font-bold rounded-full flex items-center justify-center pointer-events-none">
          {appState.pendingFriendRequestCount > 9 ? '9+' : appState.pendingFriendRequestCount}
        </span>
      {/if}
    </button>
  </header>
  <main class="p-4">
    {#if appState.currentSession}
      <section id="active-session-banner" class="bg-accent-surface border border-accent rounded-lg p-4 mb-4 flex items-center justify-between">
        <p class="text-accent font-medium">Active session in progress</p>
        <button onclick={resumeSession} class="px-4 py-2 bg-accent text-black font-semibold rounded-lg text-sm">Resume</button>
      </section>
    {/if}

    <div id="home-content" class:loading>
      {#if stats}
        <section id="stats-container" class="mb-6">
          <div class="mb-6">
            <div class="grid grid-cols-3 gap-3 mb-4">
              <div class="bg-surface border border-border rounded-lg p-3 text-center">
                <div class="text-2xl font-bold text-text-primary">{stats.totalWorkouts}</div>
                <div class="text-xs text-text-muted uppercase tracking-wider">workouts</div>
              </div>
              <div class="bg-surface border border-border rounded-lg p-3 text-center">
                <div class="text-2xl font-bold text-text-primary">{stats.totalHours}</div>
                <div class="text-xs text-text-muted uppercase tracking-wider">hours</div>
              </div>
              <div class="bg-surface border {stats.streak.current > 0 ? 'border-accent' : 'border-border'} rounded-lg p-3 text-center">
                <div class="text-2xl font-bold {stats.streak.current > 0 ? 'text-accent' : 'text-text-primary'}">{stats.streak.current}</div>
                <div class="text-xs text-text-muted uppercase tracking-wider">week streak</div>
              </div>
            </div>

            <div class="bg-surface border border-border rounded-lg p-4">
              <div class="flex justify-between items-center mb-3">
                <span class="text-sm font-medium text-text-secondary">This Week</span>
                <button class="px-3 py-1 bg-black border border-border rounded text-sm text-text-primary" onclick={editWeeklyGoal}>
                  {stats.currentWeekWorkouts.length}/{stats.weeklyGoal}
                </button>
              </div>
              <div class="flex rounded-lg overflow-hidden border border-border">
                {#each weekDays as day}
                  <div class="flex-1 h-9 flex items-center justify-center text-xs font-semibold {day.isCompleted ? 'bg-accent text-black' : day.isToday ? 'bg-black text-accent' : 'bg-black text-text-muted'}">
                    {day.label}
                  </div>
                {/each}
              </div>
              {#if weekComplete}
                <div class="mt-3 text-center text-sm text-accent font-medium">Week completed!</div>
              {/if}
            </div>
          </div>
        </section>
      {/if}

      <section class="mb-6">
        <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Start Workout</h2>
        <div id="day-buttons" class="bg-surface border border-border rounded-lg overflow-hidden">
          {#each appState.days as day}
            <button class="w-full px-4 py-3 text-left flex justify-between items-center border-b border-border last:border-b-0 active:bg-surface-elevated"
              onclick={() => startSession(day.id)}>
              <span class="font-semibold text-text-primary">{day.display_name}</span>
              {#if day.last_session_date}
                <span class="text-sm text-text-muted">{daysAgoText(day.last_session_date)}</span>
              {/if}
            </button>
          {/each}
        </div>
      </section>

      <nav class="grid grid-cols-4 gap-2 mt-6 pt-4 border-t border-border">
        <button onclick={() => navigate('history')} class="flex flex-col items-center gap-1 py-3 px-2 bg-transparent border border-border rounded-lg text-text-secondary text-sm font-medium active:bg-surface">History</button>
        <button onclick={() => navigate('progress')} class="flex flex-col items-center gap-1 py-3 px-2 bg-transparent border border-border rounded-lg text-text-secondary text-sm font-medium active:bg-surface">Progress</button>
        <button onclick={() => navigate('measurements')} class="flex flex-col items-center gap-1 py-3 px-2 bg-transparent border border-border rounded-lg text-text-secondary text-sm font-medium active:bg-surface">Body</button>
        <button onclick={() => navigate('manage')} class="flex flex-col items-center gap-1 py-3 px-2 bg-transparent border border-border rounded-lg text-text-secondary text-sm font-medium active:bg-surface">Manage</button>
      </nav>
    </div>
  </main>
</div>

<Modal open={weeklyGoalOpen} onclose={() => weeklyGoalOpen = false}>
  <div class="text-center">
    <h3 class="text-lg font-semibold mb-2">Weekly Goal</h3>
    <p class="text-sm text-text-secondary mb-4">How many times per week do you want to work out?</p>
    <div class="grid grid-cols-4 gap-2 mb-4">
      {#each [1,2,3,4,5,6,7] as n}
        <button class="p-3 {n === stats?.weeklyGoal ? 'bg-accent text-black' : 'bg-surface text-text-primary'} border border-border rounded-lg font-medium"
          onclick={() => setWeeklyGoal(n)}>{n}x/week</button>
      {/each}
    </div>
    <button class="w-full p-3 bg-black border border-border text-text-secondary rounded-lg" onclick={() => weeklyGoalOpen = false}>Cancel</button>
  </div>
</Modal>

<style>
  .screen {
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
  .loading {
    visibility: hidden;
  }
</style>
