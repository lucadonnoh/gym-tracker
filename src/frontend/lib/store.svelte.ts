// Reactive state store using Svelte 5 runes

import type { User, WorkoutDay, Session } from './types';

// App-wide reactive state
export const appState = $state({
  currentUser: null as User | null,
  days: [] as WorkoutDay[],
  currentSession: null as Session | null,
  pendingFriendRequestCount: 0,
});

// Current screen for routing
export const router = $state({
  screen: 'login' as string,
  params: {} as Record<string, string>,
});

// Navigation history for back button
export const navigationHistory: string[] = $state([]);

export function navigate(screen: string, params: Record<string, string> = {}) {
  // Build URL path
  const routes: Record<string, string> = {
    'home': '/',
    'session': '/session',
    'history': '/history',
    'session-detail': '/history/:id',
    'progress': '/progress',
    'progress-day': '/progress/:id',
    'manage': '/manage',
    'manage-day': '/manage/:id',
    'profile': '/profile',
    'measurements': '/body',
    'measurement-detail': '/body/:id',
  };

  let path = routes[screen] || '/';
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, value);
  }

  navigationHistory.push(screen);
  router.screen = screen;
  router.params = params;

  if (window.location.pathname !== path) {
    history.pushState({ screen, params }, '', path);
  }
}

export function goBack() {
  history.back();
}

export function handlePopState(event: PopStateEvent) {
  if (event.state?.screen) {
    router.screen = event.state.screen;
    router.params = event.state.params || {};
  } else {
    handleRoute(window.location.pathname);
  }
}

export function handleRoute(path: string) {
  const segments = path.split('/').filter(Boolean);

  if (segments.length === 0) {
    router.screen = 'home';
    router.params = {};
    return;
  }

  switch (segments[0]) {
    case 'session':
      router.screen = 'session';
      router.params = {};
      break;
    case 'history':
      if (segments[1]) {
        router.screen = 'session-detail';
        router.params = { id: segments[1] };
      } else {
        router.screen = 'history';
        router.params = {};
      }
      break;
    case 'progress':
      if (segments[1]) {
        router.screen = 'progress-day';
        router.params = { id: segments[1] };
      } else {
        router.screen = 'progress';
        router.params = {};
      }
      break;
    case 'body':
      if (segments[1]) {
        router.screen = 'measurement-detail';
        router.params = { id: segments[1] };
      } else {
        router.screen = 'measurements';
        router.params = {};
      }
      break;
    case 'manage':
      if (segments[1]) {
        router.screen = 'manage-day';
        router.params = { id: segments[1] };
      } else {
        router.screen = 'manage';
        router.params = {};
      }
      break;
    case 'profile':
      router.screen = 'profile';
      router.params = {};
      break;
    default:
      router.screen = 'home';
      router.params = {};
  }
}
