<script lang="ts">
  import { onMount } from 'svelte';
  import { api } from './lib/api';
  import { appState, router, navigate, handlePopState, handleRoute } from './lib/store.svelte';
  import { scrollToTop } from './lib/utils';
  import LoginScreen from './screens/LoginScreen.svelte';
  import HomeScreen from './screens/HomeScreen.svelte';
  import HistoryScreen from './screens/HistoryScreen.svelte';
  import SessionDetailScreen from './screens/SessionDetailScreen.svelte';
  import SessionScreen from './screens/SessionScreen.svelte';
  import ProgressScreen from './screens/ProgressScreen.svelte';
  import ProgressDayScreen from './screens/ProgressDayScreen.svelte';
  import ManageScreen from './screens/ManageScreen.svelte';
  import ManageDayScreen from './screens/ManageDayScreen.svelte';
  import ProfileScreen from './screens/ProfileScreen.svelte';
  import MeasurementsScreen from './screens/MeasurementsScreen.svelte';
  import MeasurementDetailScreen from './screens/MeasurementDetailScreen.svelte';

  let initialized = $state(false);

  // Scroll to top on screen change
  $effect(() => {
    const _screen = router.screen;
    scrollToTop();
  });

  onMount(async () => {
    // Disable browser's automatic scroll restoration
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }

    // Handle browser back/forward
    window.addEventListener('popstate', handlePopState);

    // Set up auth error handler
    api.setAuthErrorHandler(() => {
      appState.currentUser = null;
      router.screen = 'login';
    });

    // Check authentication
    if (!api.isAuthenticated()) {
      router.screen = 'login';
      initialized = true;
      return;
    }

    // Verify token is still valid
    try {
      appState.currentUser = await api.getMe();
    } catch {
      router.screen = 'login';
      initialized = true;
      return;
    }

    // Load initial data
    const [days, activeSession] = await Promise.all([
      api.getDays(),
      api.getActiveSession(),
    ]);

    appState.days = days;
    if (activeSession) {
      appState.currentSession = activeSession;
    }

    // Update friend request badge (non-blocking)
    api.getPendingFriendRequests().then(requests => {
      appState.pendingFriendRequestCount = requests.length;
    }).catch(() => {});

    initialized = true;

    // Handle initial route
    handleRoute(window.location.pathname);

    // If route didn't change from login, show home
    if (router.screen === 'login') {
      router.screen = 'home';
    }

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<div id="app" class="max-w-[480px] mx-auto min-h-screen bg-black">
  {#if !initialized}
    <!-- Loading state - hidden until JS initializes -->
  {:else if router.screen === 'login'}
    <LoginScreen />
  {:else if router.screen === 'home'}
    <HomeScreen />
  {:else if router.screen === 'session'}
    <SessionScreen />
  {:else if router.screen === 'history'}
    <HistoryScreen />
  {:else if router.screen === 'session-detail'}
    <SessionDetailScreen params={router.params} />
  {:else if router.screen === 'progress'}
    <ProgressScreen />
  {:else if router.screen === 'progress-day'}
    <ProgressDayScreen params={router.params} />
  {:else if router.screen === 'manage'}
    <ManageScreen />
  {:else if router.screen === 'manage-day'}
    <ManageDayScreen params={router.params} />
  {:else if router.screen === 'profile'}
    <ProfileScreen />
  {:else if router.screen === 'measurements'}
    <MeasurementsScreen />
  {:else if router.screen === 'measurement-detail'}
    <MeasurementDetailScreen params={router.params} />
  {:else}
    <HomeScreen />
  {/if}
</div>
