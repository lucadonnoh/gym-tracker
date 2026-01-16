import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import * as templates from '../templates.js';

/**
 * Session detail screen - shows details of a past workout session.
 * Has viewingSessionId state.
 */
export class SessionDetailScreen extends BaseScreen {
  readonly id = 'session-detail-screen';
  readonly route = '/history/:id';

  // Store session ID for this screen instance
  private sessionId: number | null = null;

  private get $detailSessionTitle() {
    return document.getElementById('detail-session-title');
  }

  private get $sessionDetailContent() {
    return document.getElementById('session-detail-content');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(params: RouteParams): Promise<void> {
    this.sessionId = params.id ? parseInt(params.id) : null;

    if (!this.sessionId) {
      this.ctx.goBack();
      return;
    }

    const state = this.ctx.getState();

    const [exercises, session, stats] = await Promise.all([
      api.getSessionExercises(this.sessionId),
      api.getSession(this.sessionId),
      api.getSessionStats(this.sessionId)
    ]);

    // Set title
    if (this.$detailSessionTitle) {
      const day = state.days.find(d => d.id === session.day_id);
      const date = new Date(session.started_at).toLocaleDateString();
      this.$detailSessionTitle.textContent = `${day?.display_name || 'Session'} - ${date}`;
    }

    // Render content
    if (!this.$sessionDetailContent) return;

    const totalVolume = stats.reduce((sum, s) => sum + s.volume, 0);
    const prCounts = {
      volume: stats.filter(s => s.prs?.volume).length,
      setVolume: stats.filter(s => s.prs?.setVolume).length,
      weight: stats.filter(s => s.prs?.weight).length,
      reps: stats.filter(s => s.prs?.reps).length
    };
    const totalPRs = prCounts.volume + prCounts.setVolume + prCounts.weight + prCounts.reps;

    const timingHtml = templates.renderSessionTiming(session.id, session.started_at, session.ended_at);
    const summaryHtml = templates.renderSessionSummary(totalVolume, exercises.length, totalPRs);
    const exercisesHtml = exercises.map(ex => {
      const exStats = stats.find(s => s.exerciseId === ex.id);
      return templates.renderSessionDetailExercise(ex, exStats);
    }).join('');

    this.$sessionDetailContent.innerHTML = timingHtml + summaryHtml + exercisesHtml;
  }

  exit(): void {
    this.sessionId = null;
    super.exit();
  }

  getSessionId(): number | null {
    return this.sessionId;
  }
}
