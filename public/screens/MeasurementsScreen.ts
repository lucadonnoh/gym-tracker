import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import { MEASUREMENT_FIELDS } from '../types.js';

// Chart.js is loaded via script tag
declare const Chart: any;

/**
 * Body measurements screen - displays measurement history and charts.
 * Has chart cleanup responsibility.
 */
export class MeasurementsScreen extends BaseScreen {
  readonly id = 'measurements-screen';
  readonly route = '/body';

  private get $measurementsSummary() {
    return document.getElementById('measurements-summary');
  }

  private get $measurementsCharts() {
    return document.getElementById('measurements-charts');
  }

  private get $measurementsHistory() {
    return document.getElementById('measurements-history');
  }

  constructor(ctx: ScreenContext) {
    super(ctx);
  }

  async enter(_params: RouteParams): Promise<void> {
    const [measurements, latest] = await Promise.all([
      api.getMeasurements(),
      api.getLatestMeasurement()
    ]);

    // Render summary
    if (this.$measurementsSummary && latest) {
      const stats = MEASUREMENT_FIELDS
        .filter(f => latest[f.key] !== null)
        .slice(0, 5)
        .map(f => `<div class="measurement-stat"><span class="stat-value">${latest[f.key]}</span><span class="stat-label">${f.unit} ${f.label.toLowerCase()}</span></div>`)
        .join('');

      this.$measurementsSummary.innerHTML = `
        <div class="measurement-summary-card">
          <div class="measurement-summary-date">Last: ${new Date(latest.measured_at).toLocaleDateString()}</div>
          <div class="measurement-summary-stats">${stats}</div>
        </div>
      `;
    } else if (this.$measurementsSummary) {
      this.$measurementsSummary.innerHTML = '';
    }

    // Render charts (errors shouldn't break navigation)
    try {
      await this.renderCharts(measurements);
    } catch (err) {
      console.error('Failed to render measurement charts:', err);
    }

    // Render history
    if (this.$measurementsHistory) {
      if (measurements.length === 0) {
        this.$measurementsHistory.innerHTML = '<p class="no-data">No measurements yet</p>';
      } else {
        this.$measurementsHistory.innerHTML = measurements.map(m => {
          const details = MEASUREMENT_FIELDS
            .filter(f => m[f.key] !== null)
            .slice(0, 2)
            .map(f => `${m[f.key]} ${f.unit}`)
            .join(' • ');
          return `
            <div class="history-item" onclick="app.showMeasurementDetail(${m.id})">
              <div class="history-item-header">
                <strong>${new Date(m.measured_at).toLocaleDateString()}</strong>
              </div>
              <div class="history-item-details">${details}</div>
            </div>
          `;
        }).join('');
      }
    }
  }

  private async renderCharts(measurements: any[]): Promise<void> {
    if (measurements.length === 0 || !this.$measurementsCharts) {
      if (this.$measurementsCharts) this.$measurementsCharts.innerHTML = '';
      return;
    }

    // Determine which measurements have data
    const chartsToRender = MEASUREMENT_FIELDS.filter(field =>
      measurements.some(m => m[field.key] !== null)
    ).slice(0, 4); // Max 4 charts

    this.$measurementsCharts.innerHTML = chartsToRender
      .map(f => `<div class="chart-container"><canvas id="chart-${f.key}"></canvas></div>`)
      .join('');

    // Create charts
    for (const field of chartsToRender) {
      const canvas = document.getElementById(`chart-${field.key}`) as HTMLCanvasElement;
      if (!canvas) continue;

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      const data = measurements
        .filter(m => m[field.key] !== null)
        .map(m => ({
          x: new Date(m.measured_at).getTime(),
          y: m[field.key]
        }))
        .sort((a, b) => a.x - b.x);

      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          datasets: [{
            label: `${field.label} (${field.unit})`,
            data: data,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79, 70, 229, 0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { type: 'time', time: { unit: 'day' } },
            y: { beginAtZero: false }
          }
        }
      });

      this.registerChart(chart);
    }
  }

  // Cleanup handled by BaseScreen.exit() via registerChart()
}
