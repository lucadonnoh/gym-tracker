import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import { MEASUREMENT_FIELDS } from '../types.js';

/**
 * Measurement detail screen - shows details of a single measurement.
 * Has viewingMeasurementId state.
 */
export class MeasurementDetailScreen extends BaseScreen {
  readonly id = 'measurement-detail-screen';
  readonly route = '/body/:id';

  // Store measurement ID for this screen instance
  private measurementId: number | null = null;

  private get $measurementDetailTitle() {
    return document.getElementById('measurement-detail-title');
  }

  private get $measurementDetailContent() {
    return document.getElementById('measurement-detail-content');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(params: RouteParams): Promise<void> {
    this.measurementId = params.id ? parseInt(params.id) : null;

    if (!this.measurementId) {
      this.ctx.goBack();
      return;
    }

    const m = await api.getMeasurement(this.measurementId);

    // Set title
    if (this.$measurementDetailTitle) {
      this.$measurementDetailTitle.textContent = new Date(m.measured_at).toLocaleDateString();
    }

    // Render content
    if (this.$measurementDetailContent) {
      const rows = MEASUREMENT_FIELDS
        .filter(f => m[f.key] !== null)
        .map(f => `<div class="detail-row"><span class="detail-label">${f.label}</span><span class="detail-value">${m[f.key]} ${f.unit}</span></div>`)
        .join('');

      let html = `<div class="measurement-detail-rows">${rows || '<p class="no-data">No measurements recorded</p>'}</div>`;
      if (m.notes) {
        html += `<div class="measurement-notes-display"><strong>Notes:</strong> ${m.notes}</div>`;
      }
      html += `<button class="edit-measurement-btn" onclick="app.editMeasurement(${m.id})">Edit</button>`;

      this.$measurementDetailContent.innerHTML = html;
    }
  }

  exit(): void {
    this.measurementId = null;
    super.exit();
  }

  getMeasurementId(): number | null {
    return this.measurementId;
  }
}
