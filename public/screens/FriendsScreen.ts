import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import type { Friend, FriendRequest, User } from '../types.js';

/**
 * Friends screen - manage friends and friend requests.
 */
export class FriendsScreen extends BaseScreen {
  readonly id = 'friends-screen';
  readonly route = '/friends';

  private searchTimeout: number | null = null;

  private get $friendSearchInput() {
    return document.getElementById('friend-search-input') as HTMLInputElement;
  }

  private get $friendSearchResults() {
    return document.getElementById('friend-search-results');
  }

  private get $pendingRequestsSection() {
    return document.getElementById('pending-requests-section');
  }

  private get $pendingRequests() {
    return document.getElementById('pending-requests');
  }

  private get $friendsList() {
    return document.getElementById('friends-list');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    // Clear search
    if (this.$friendSearchInput) {
      this.$friendSearchInput.value = '';
    }
    if (this.$friendSearchResults) {
      this.$friendSearchResults.innerHTML = '';
    }

    await this.loadFriendsData();
  }

  async loadFriendsData(): Promise<void> {
    const [friends, pendingRequests] = await Promise.all([
      api.getFriends(),
      api.getPendingFriendRequests()
    ]);

    this.renderFriendsList(friends);
    this.renderPendingRequests(pendingRequests);
  }

  private renderFriendsList(friends: Friend[]): void {
    if (!this.$friendsList) return;

    if (friends.length === 0) {
      this.$friendsList.innerHTML = '<p class="p-4 text-text-muted text-center">No friends yet</p>';
      return;
    }

    this.$friendsList.innerHTML = friends.map(friend => `
      <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
        <div>
          <span class="font-medium text-text-primary">${friend.username}</span>
          <span class="text-sm text-text-muted ml-2">since ${this.formatDate(friend.since)}</span>
        </div>
        <button onclick="app.removeFriend(${friend.user_id})"
          class="px-3 py-1 text-sm text-danger border border-danger-dim rounded-lg active:bg-danger-dim">Remove</button>
      </div>
    `).join('');
  }

  private renderPendingRequests(requests: FriendRequest[]): void {
    if (!this.$pendingRequestsSection || !this.$pendingRequests) return;

    if (requests.length === 0) {
      this.$pendingRequestsSection.classList.add('hidden');
      return;
    }

    this.$pendingRequestsSection.classList.remove('hidden');
    this.$pendingRequests.innerHTML = requests.map(req => `
      <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
        <span class="font-medium text-text-primary">${req.from_username}</span>
        <div class="flex gap-2">
          <button onclick="app.acceptFriendRequest(${req.id})"
            class="px-3 py-1 text-sm bg-accent text-black font-medium rounded-lg">Accept</button>
          <button onclick="app.rejectFriendRequest(${req.id})"
            class="px-3 py-1 text-sm text-text-muted border border-border rounded-lg">Decline</button>
        </div>
      </div>
    `).join('');
  }

  async searchFriends(): Promise<void> {
    const query = this.$friendSearchInput?.value?.trim() || '';

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (query.length < 2) {
      if (this.$friendSearchResults) {
        this.$friendSearchResults.innerHTML = '';
      }
      return;
    }

    // Debounce search
    this.searchTimeout = window.setTimeout(async () => {
      try {
        const users = await api.searchUsers(query);
        this.renderSearchResults(users);
      } catch (e) {
        console.error('Search failed:', e);
      }
    }, 300);
  }

  private renderSearchResults(users: User[]): void {
    if (!this.$friendSearchResults) return;

    if (users.length === 0) {
      this.$friendSearchResults.innerHTML = '<p class="p-3 text-text-muted text-sm">No users found</p>';
      return;
    }

    this.$friendSearchResults.innerHTML = `
      <div class="bg-surface border border-border rounded-lg overflow-hidden">
        ${users.map(user => `
          <div class="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
            <span class="text-text-primary">${user.username}</span>
            <button onclick="app.sendFriendRequest(${user.id})"
              class="px-3 py-1 text-sm bg-accent text-black font-medium rounded-lg">Add</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  async sendFriendRequest(userId: number): Promise<void> {
    const result = await api.sendFriendRequest(userId);
    if ('error' in result) {
      alert(result.error);
      return;
    }

    // Clear search and reload
    if (this.$friendSearchInput) {
      this.$friendSearchInput.value = '';
    }
    if (this.$friendSearchResults) {
      this.$friendSearchResults.innerHTML = '<p class="p-3 text-accent text-sm">Friend request sent!</p>';
    }

    // Reload data in case they became friends instantly (mutual request)
    await this.loadFriendsData();
  }

  async acceptFriendRequest(requestId: number): Promise<void> {
    const result = await api.acceptFriendRequest(requestId);
    if ('error' in result) {
      alert(result.error);
      return;
    }
    await this.loadFriendsData();
  }

  async rejectFriendRequest(requestId: number): Promise<void> {
    const result = await api.rejectFriendRequest(requestId);
    if ('error' in result) {
      alert(result.error);
      return;
    }
    await this.loadFriendsData();
  }

  async removeFriend(friendId: number): Promise<void> {
    if (!confirm('Remove this friend?')) return;

    const removed = await api.removeFriend(friendId);
    if (!removed) {
      alert('Failed to remove friend');
      return;
    }
    await this.loadFriendsData();
  }

  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  exit(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }
    super.exit();
  }
}
