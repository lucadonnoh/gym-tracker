# Claude Instructions for Gym Tracker

## Core Principle: USABILITY FIRST

**This app is used during workouts. Functionality must NEVER be sacrificed for aesthetics.**

### Critical Rules

1. **Never hide or truncate information** - Exercise names, weights, reps, and stats must always be fully visible
2. **Never make the user guess** - All information needed to complete a workout must be immediately clear
3. **Layout consistency is secondary to information clarity** - If layout looks slightly inconsistent but all info is visible, that's acceptable. The reverse is NOT acceptable.
4. **Test on mobile** - This is primarily a mobile app used with sweaty hands during workouts

### When Making Design Decisions

Ask: "Will this make it harder for someone mid-workout to see what they need to do?"

If yes → Don't do it.

## Debugging Approach: TEST-DRIVEN DEBUGGING

**Always follow this approach when fixing bugs:**

1. **Write a test FIRST** that reproduces/detects the issue
2. **Run the test** to confirm it fails (proves the test catches the bug)
3. **Fix the issue** in the code
4. **Rerun the test** to confirm it passes
5. **Never test only for known symptoms** - use general detection methods (like CLS API for layout shifts) that catch unknown issues too

This prevents:
- Fixing symptoms without fixing root cause
- Tests that pass even when bug exists
- Regression of the same bug later

## Frontend Architecture: Svelte 5 + Vite

The frontend is built with **Svelte 5** (runes mode) and **Vite**. Each screen is a `.svelte` component in `src/frontend/screens/`.

### Key files
- `src/frontend/App.svelte` - Root component with screen routing
- `src/frontend/lib/store.svelte.ts` - Reactive state (`appState`, `router`, `navigate`)
- `src/frontend/lib/api.ts` - API client (framework-agnostic)
- `src/frontend/lib/Modal.svelte` - Reusable modal component
- `src/frontend/lib/types.ts` - Shared TypeScript interfaces
- `src/frontend/lib/utils.ts` - Helper functions
- `src/frontend/app.css` - Tailwind CSS + custom theme

### Build
- `npm run build` - Vite builds to `public/` (served by Express)
- `npm run dev:frontend` - Vite dev server with HMR (proxies API to port 3000)
- `npm run dev` - Express backend dev server

### Patterns
- Screens load data in `onMount` via the API client
- State is shared via `appState` (Svelte 5 `$state` rune)
- Navigation uses `navigate(screen, params)` which updates `router` state and `history.pushState`
- Modals use the `<Modal>` component with `open` boolean prop
- Screen root elements must have IDs matching e2e test selectors (e.g., `id="home-screen"`)
