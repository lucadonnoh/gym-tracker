<script lang="ts">
  import { api } from '../lib/api';
  import { appState, navigate } from '../lib/store.svelte';

  let username = $state('');
  let password = $state('');
  let error = $state('');
  let submitting = $state(false);

  export async function initAfterLogin() {
    const [days, activeSession, stats] = await Promise.all([
      api.getDays(),
      api.getActiveSession(),
      api.getSummaryStats()
    ]);
    appState.days = days;
    if (activeSession) {
      appState.currentSession = activeSession;
    }

    // Update friend request badge (non-blocking)
    api.getPendingFriendRequests().then(requests => {
      appState.pendingFriendRequestCount = requests.length;
    }).catch(() => {});

    navigate('home');
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;

    submitting = true;
    error = '';

    try {
      const result = await api.login(username.trim(), password);

      if ('error' in result) {
        error = result.error;
        submitting = false;
        return;
      }

      appState.currentUser = result.user;
      password = '';
      await initAfterLogin();
    } catch {
      error = 'Login failed. Please try again.';
      submitting = false;
    }
  }
</script>

<div id="login-screen" class="screen active min-h-screen flex flex-col bg-black">
  <main class="flex-1 flex items-center justify-center min-h-screen p-6">
    <div class="w-full max-w-[320px]">
      <h1 class="text-[1.75rem] font-semibold text-center mb-8 tracking-tight">Gym Tracker</h1>
      <form onsubmit={handleSubmit} class="flex flex-col gap-4">
        <label class="flex flex-col gap-1 text-[0.9375rem] text-text-secondary">
          Username
          <input type="text" id="login-username" bind:value={username} required autocomplete="username"
            class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent">
        </label>
        <label class="flex flex-col gap-1 text-[0.9375rem] text-text-secondary">
          Password
          <input type="password" id="login-password" bind:value={password} required autocomplete="current-password"
            class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent">
        </label>
        {#if error}
          <div class="p-3 bg-danger-dim border border-danger rounded-lg text-danger text-sm text-center">{error}</div>
        {/if}
        <button type="submit" id="login-submit" disabled={submitting}
          class="w-full p-4 bg-accent text-black font-semibold rounded-lg text-base mt-2 active:opacity-90">
          Login
        </button>
      </form>
    </div>
  </main>
</div>

<style>
  .screen {
    display: flex;
    min-height: 100dvh;
    flex-direction: column;
    background: var(--color-black);
  }
</style>
