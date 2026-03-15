<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from '../lib/api';
  import { appState, goBack } from '../lib/store.svelte';
  import type { Friend, FriendRequest, User } from '../lib/types';
  import Modal from '../lib/Modal.svelte';

  let friends = $state<Friend[]>([]);
  let pendingRequests = $state<FriendRequest[]>([]);
  let loading = $state(true);

  // Search
  let searchQuery = $state('');
  let searchResults = $state<User[]>([]);
  let searchTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
  let searching = $state(false);

  // Password modal
  let passwordModalOpen = $state(false);
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let passwordError = $state('');
  let passwordSuccess = $state('');
  let changingPassword = $state(false);

  onMount(() => { load(); });

  async function load() {
    loading = true;
    try {
      const [f, p] = await Promise.all([
        api.getFriends(),
        api.getPendingFriendRequests()
      ]);
      friends = f;
      pendingRequests = p;
      appState.pendingFriendRequestCount = p.length;
    } catch (err) {
      console.error('Failed to load profile data', err);
    }
    loading = false;
  }

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searching = true;
    searchTimeout = setTimeout(async () => {
      try {
        searchResults = await api.searchUsers(searchQuery.trim());
      } catch (err) {
        console.error('Search failed', err);
      }
      searching = false;
    }, 300);
  }

  async function sendFriendRequest(userId: number) {
    try {
      const result = await api.sendFriendRequest(userId);
      if ('error' in result) {
        alert(result.error);
        return;
      }
      searchResults = searchResults.filter(u => u.id !== userId);
    } catch (err) {
      alert('Failed to send friend request');
      console.error(err);
    }
  }

  async function acceptRequest(requestId: number) {
    try {
      const result = await api.acceptFriendRequest(requestId);
      if ('error' in result) {
        alert(result.error);
        return;
      }
      pendingRequests = pendingRequests.filter(r => r.id !== requestId);
      appState.pendingFriendRequestCount = pendingRequests.length;
      friends = await api.getFriends();
    } catch (err) {
      alert('Failed to accept request');
      console.error(err);
    }
  }

  async function declineRequest(requestId: number) {
    try {
      const result = await api.rejectFriendRequest(requestId);
      if ('error' in result) {
        alert(result.error);
        return;
      }
      pendingRequests = pendingRequests.filter(r => r.id !== requestId);
      appState.pendingFriendRequestCount = pendingRequests.length;
    } catch (err) {
      alert('Failed to decline request');
      console.error(err);
    }
  }

  async function removeFriend(friendId: number) {
    if (!confirm('Remove this friend?')) return;
    try {
      await api.removeFriend(friendId);
      friends = friends.filter(f => f.user_id !== friendId);
    } catch (err) {
      alert('Failed to remove friend');
      console.error(err);
    }
  }

  function openPasswordModal() {
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
    passwordError = '';
    passwordSuccess = '';
    changingPassword = false;
    passwordModalOpen = true;
  }

  function closePasswordModal() {
    passwordModalOpen = false;
  }

  async function handleChangePassword() {
    passwordError = '';
    passwordSuccess = '';

    if (newPassword.length < 4) {
      passwordError = 'New password must be at least 4 characters.';
      return;
    }
    if (newPassword !== confirmPassword) {
      passwordError = 'Passwords do not match.';
      return;
    }

    changingPassword = true;
    try {
      const result = await api.changePassword(currentPassword, newPassword);
      if ('error' in result) {
        passwordError = result.error;
        changingPassword = false;
        return;
      }
      passwordSuccess = 'Password changed successfully.';
      changingPassword = false;
    } catch (err) {
      passwordError = 'Failed to change password.';
      changingPassword = false;
      console.error(err);
    }
  }

  async function handleLogout() {
    await api.logout();
    appState.currentUser = null;
    appState.currentSession = null;
    appState.days = [];
    appState.pendingFriendRequestCount = 0;
    window.location.href = '/';
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
</script>

<div id="profile-screen" class="screen active">
  <header class="bg-black text-text-primary p-4 flex items-center justify-between sticky top-0 z-10 border-b border-border">
    <button class="text-text-secondary text-sm font-medium" onclick={() => goBack()}>Back</button>
    <h1 class="text-lg font-semibold">Profile</h1>
    <div class="w-10"></div>
  </header>

  <main class="p-4">
    <!-- User Info -->
    <section class="flex items-center gap-4 mb-6 bg-surface border border-border rounded-lg p-4">
      <div class="w-14 h-14 bg-surface-elevated border border-border rounded-full flex items-center justify-center text-2xl">
        👤
      </div>
      <div>
        <div class="text-lg font-semibold text-text-primary">{appState.currentUser?.username ?? ''}</div>
        <div class="text-sm text-text-muted">Member</div>
      </div>
    </section>

    <!-- Friends Section -->
    <section class="mb-6">
      <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Friends</h2>

      <!-- Search -->
      <div class="mb-3">
        <input
          type="text"
          placeholder="Search users..."
          bind:value={searchQuery}
          oninput={handleSearchInput}
          class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
        />
      </div>

      <!-- Search Results -->
      {#if searchQuery.trim() && searchResults.length > 0}
        <div class="bg-surface border border-border rounded-lg overflow-hidden mb-3">
          {#each searchResults as user}
            <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
              <span class="text-text-primary text-sm">{user.username}</span>
              <button
                class="px-3 py-1 bg-accent text-black text-xs font-semibold rounded-lg"
                onclick={() => sendFriendRequest(user.id)}
              >
                Add
              </button>
            </div>
          {/each}
        </div>
      {:else if searchQuery.trim() && !searching && searchResults.length === 0}
        <div class="text-sm text-text-muted mb-3">No users found.</div>
      {/if}

      <!-- Pending Requests -->
      {#if pendingRequests.length > 0}
        <div class="mb-3">
          <h3 class="text-xs text-text-secondary mb-2 font-medium">Pending Requests</h3>
          <div class="bg-surface border border-border rounded-lg overflow-hidden">
            {#each pendingRequests as request}
              <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
                <span class="text-text-primary text-sm">{request.from_username}</span>
                <div class="flex gap-2">
                  <button
                    class="px-3 py-1 bg-accent text-black text-xs font-semibold rounded-lg"
                    onclick={() => acceptRequest(request.id)}
                  >
                    Accept
                  </button>
                  <button
                    class="px-3 py-1 bg-black border border-border text-text-secondary text-xs font-medium rounded-lg"
                    onclick={() => declineRequest(request.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Friends List -->
      {#if loading}
        <div class="text-center text-text-muted py-4">Loading...</div>
      {:else if friends.length === 0}
        <div class="text-center text-text-muted py-4 text-sm">No friends yet. Search for users above.</div>
      {:else}
        <div class="bg-surface border border-border rounded-lg overflow-hidden">
          {#each friends as friend}
            <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
              <div>
                <span class="text-text-primary text-sm font-medium">{friend.username}</span>
                <span class="text-text-muted text-xs ml-2">since {formatDate(friend.since)}</span>
              </div>
              <button
                class="px-3 py-1 bg-black border border-border text-danger text-xs font-medium rounded-lg"
                onclick={() => removeFriend(friend.user_id)}
              >
                Remove
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Account Section -->
    <section class="mb-6">
      <h2 class="text-xs uppercase tracking-wider text-text-muted mb-3 font-medium">Account</h2>
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        <button
          class="w-full px-4 py-3 text-left text-text-primary text-sm font-medium border-b border-border active:bg-surface-elevated"
          onclick={openPasswordModal}
        >
          Change Password
        </button>
        <button
          class="w-full px-4 py-3 text-left text-danger text-sm font-medium active:bg-surface-elevated"
          onclick={handleLogout}
        >
          Logout
        </button>
      </div>
    </section>
  </main>
</div>

<!-- Password Change Modal -->
<Modal open={passwordModalOpen} onclose={closePasswordModal}>
  <h3 class="text-lg font-semibold mb-4">Change Password</h3>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    Current Password
    <input
      type="password"
      bind:value={currentPassword}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-3">
    New Password
    <input
      type="password"
      bind:value={newPassword}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  <label class="flex flex-col gap-1 text-sm text-text-secondary mb-4">
    Confirm New Password
    <input
      type="password"
      bind:value={confirmPassword}
      class="w-full p-3 bg-black border border-border rounded-lg text-base text-text-primary focus:outline-none focus:border-accent"
    />
  </label>

  {#if passwordError}
    <div class="p-3 mb-3 bg-danger-dim border border-danger rounded-lg text-danger text-sm text-center">{passwordError}</div>
  {/if}
  {#if passwordSuccess}
    <div class="p-3 mb-3 bg-accent-surface border border-accent rounded-lg text-accent text-sm text-center">{passwordSuccess}</div>
  {/if}

  <div class="flex gap-2">
    <button
      class="flex-1 p-3 bg-black border border-border text-text-secondary rounded-lg font-medium"
      onclick={closePasswordModal}
    >
      Cancel
    </button>
    <button
      class="flex-1 p-3 bg-accent text-black rounded-lg font-semibold"
      onclick={handleChangePassword}
      disabled={changingPassword}
    >
      {changingPassword ? 'Saving...' : 'Save'}
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
