// Chart.js is loaded via script tag, so we declare it as a global
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Chart = any;

// Route parameters passed to screens
export interface RouteParams {
  [key: string]: string;
}

// Import actual types from main types file
import type { User, WorkoutDay, Session } from '../types.js';

// Shared app state accessible to all screens
export interface AppState {
  currentUser: User | null;
  days: WorkoutDay[];
  currentSession: Session | null;
}

// Context provided to screens for navigation and state access
export interface ScreenContext {
  // Navigation
  navigate(screenId: string, params?: RouteParams): Promise<void>;
  goBack(): void;
  updateUrl(screenId: string, params?: RouteParams): void;

  // State
  getState(): AppState;
  setState(updates: Partial<AppState>): void;

  // DOM helpers
  showScreen(screenId: string): void;
  scrollToTop(): void;
}

// Screen interface - all screens must implement this
export interface Screen {
  /** Unique screen identifier matching DOM element id */
  readonly id: string;

  /** URL route pattern (e.g., '/history', '/history/:id') */
  readonly route: string;

  /**
   * Called when entering the screen.
   * MUST load all required data and render content.
   * Screen will not be shown until this completes.
   */
  enter(params: RouteParams): Promise<void>;

  /**
   * Called when leaving the screen.
   * Clean up timers, charts, subscriptions.
   */
  exit(): void;
}

