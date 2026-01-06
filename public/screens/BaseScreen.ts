import type { Screen, RouteParams, ScreenContext, Chart } from './types.js';

/**
 * Base class for screens with common cleanup functionality.
 * Automatically handles chart and interval cleanup on exit.
 */
export abstract class BaseScreen implements Screen {
  abstract readonly id: string;
  abstract readonly route: string;

  protected ctx: ScreenContext;
  protected charts: Chart[] = [];
  protected intervals: number[] = [];

  constructor(ctx: ScreenContext) {
    this.ctx = ctx;
  }

  abstract enter(params: RouteParams): Promise<void>;

  /**
   * Default exit implementation cleans up charts and intervals.
   * Override and call super.exit() if you need additional cleanup.
   */
  exit(): void {
    // Destroy all registered charts
    for (const chart of this.charts) {
      chart.destroy();
    }
    this.charts = [];

    // Clear all registered intervals
    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];
  }

  /**
   * Register a chart for automatic cleanup on exit.
   */
  protected registerChart(chart: Chart): void {
    this.charts.push(chart);
  }

  /**
   * Register an interval for automatic cleanup on exit.
   */
  protected registerInterval(interval: number): void {
    this.intervals.push(interval);
  }

  /**
   * Get a DOM element by ID with type safety.
   */
  protected $(id: string): HTMLElement | null {
    return document.getElementById(id);
  }
}
