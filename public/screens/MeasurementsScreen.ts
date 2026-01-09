import { BaseScreen } from './BaseScreen.js';
import type { RouteParams, ScreenContext } from './types.js';
import { api } from '../api.js';
import { MEASUREMENT_FIELDS, BodyMeasurement } from '../types.js';

// Chart.js is loaded via script tag
declare const Chart: any;

/**
 * Body measurements screen - displays measurement history and charts.
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
    const measurements = await api.getMeasurements();

    // Sort by date descending
    measurements.sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime());

    const latest = measurements[0];
    const weekAgo = this.findMeasurementFromDaysAgo(measurements, 7);

    // Render summary with changes
    this.renderSummary(latest, weekAgo);

    // Render charts
    try {
      await this.renderCharts(measurements);
    } catch (err) {
      console.error('Failed to render measurement charts:', err);
    }

    // Render history
    this.renderHistory(measurements);
  }

  private findMeasurementFromDaysAgo(measurements: BodyMeasurement[], days: number): BodyMeasurement | null {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - days);

    // Find the measurement closest to target date (but before it)
    for (const m of measurements) {
      const mDate = new Date(m.measured_at);
      if (mDate <= targetDate) {
        return m;
      }
    }
    return measurements[measurements.length - 1] || null; // Return oldest if none found
  }

  private renderSummary(latest: BodyMeasurement | undefined, weekAgo: BodyMeasurement | null): void {
    if (!this.$measurementsSummary) return;

    if (!latest) {
      this.$measurementsSummary.innerHTML = `
        <div class="measurements-empty-state">
          <p>No measurements recorded yet</p>
          <p class="hint">Track your progress by adding your first measurement</p>
        </div>
      `;
      return;
    }

    // Key metrics to show: weight, chest, waist, arms (average)
    const keyMetrics = this.getKeyMetrics(latest, weekAgo);

    this.$measurementsSummary.innerHTML = `
      <div class="measurements-summary-grid">
        ${keyMetrics.map(m => `
          <div class="metric-card ${m.changeClass}">
            <div class="metric-label">${m.label}</div>
            <div class="metric-value">${m.value}<span class="metric-unit">${m.unit}</span></div>
            ${m.change !== null ? `
              <div class="metric-change">
                <span class="change-arrow">${m.changeDirection}</span>
                <span class="change-value">${m.changeText}</span>
                <span class="change-period">vs 7d ago</span>
              </div>
            ` : `
              <div class="metric-change no-data">No prior data</div>
            `}
          </div>
        `).join('')}
      </div>
      <div class="last-measured">Last measured: ${new Date(latest.measured_at).toLocaleDateString()}</div>
    `;
  }

  private getKeyMetrics(latest: BodyMeasurement, weekAgo: BodyMeasurement | null): Array<{
    label: string;
    value: string;
    unit: string;
    change: number | null;
    changeText: string;
    changeDirection: string;
    changeClass: string;
  }> {
    const metrics: Array<{
      label: string;
      value: string;
      unit: string;
      change: number | null;
      changeText: string;
      changeDirection: string;
      changeClass: string;
    }> = [];

    // Fields where decrease is good (fat loss indicators)
    const decreaseIsGood = ['waist', 'hips'];
    // Fields where change is neutral (depends on goals)
    const neutralChange = ['weight'];

    // Iterate over all measurement fields
    for (const field of MEASUREMENT_FIELDS) {
      const value = latest[field.key] as number | null;
      if (value === null) continue;

      const oldValue = weekAgo?.[field.key] as number | null | undefined;
      const change = oldValue != null ? value - oldValue : null;

      let changeClass = '';
      if (change !== null && change !== 0) {
        if (neutralChange.includes(field.key)) {
          // Weight: just show direction, no good/bad
          changeClass = change > 0 ? 'change-up' : 'change-down';
        } else if (decreaseIsGood.includes(field.key)) {
          // Waist/Hips: down is good
          changeClass = change > 0 ? 'change-up-bad' : 'change-down-good';
        } else {
          // Muscle measurements: up is good
          changeClass = change > 0 ? 'change-up-good' : 'change-down-bad';
        }
      } else if (change === 0) {
        changeClass = 'change-neutral';
      }

      metrics.push({
        label: field.label,
        value: value.toFixed(1),
        unit: field.unit,
        change,
        changeText: change !== null ? `${Math.abs(change).toFixed(1)} ${field.unit}` : '',
        changeDirection: change !== null ? (change > 0 ? '↑' : change < 0 ? '↓' : '→') : '',
        changeClass
      });
    }

    return metrics;
  }

  private async renderCharts(measurements: BodyMeasurement[]): Promise<void> {
    if (!this.$measurementsCharts) return;

    if (measurements.length < 2) {
      this.$measurementsCharts.innerHTML = `
        <div class="charts-empty-state">
          <p>Add more measurements to see progress charts</p>
        </div>
      `;
      return;
    }

    // Show charts for all fields that have data
    const chartsToRender = MEASUREMENT_FIELDS
      .filter(f => measurements.some(m => m[f.key] !== null));

    if (chartsToRender.length === 0) {
      this.$measurementsCharts.innerHTML = '';
      return;
    }

    this.$measurementsCharts.innerHTML = chartsToRender
      .map(f => `
        <div class="chart-container">
          <div class="chart-title">${f.label}</div>
          <canvas id="chart-${f.key}"></canvas>
        </div>
      `)
      .join('');

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
            label: field.label,
            data: data,
            borderColor: field.color,
            backgroundColor: field.color + '20',
            fill: true,
            tension: 0.3,
            pointRadius: 4,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (context: any) => `${context.parsed.y} ${field.unit}`
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: { unit: 'day' },
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: { color: '#888' }
            },
            y: {
              beginAtZero: false,
              grid: { color: 'rgba(255,255,255,0.1)' },
              ticks: {
                color: '#888',
                callback: (value: number) => `${value} ${field.unit}`
              }
            }
          }
        }
      });

      this.registerChart(chart);
    }
  }

  private renderHistory(measurements: BodyMeasurement[]): void {
    if (!this.$measurementsHistory) return;

    if (measurements.length === 0) {
      this.$measurementsHistory.innerHTML = '<p class="no-data">No measurements yet</p>';
      return;
    }

    this.$measurementsHistory.innerHTML = `
      <h3 class="history-title">History</h3>
      ${measurements.map((m, i) => {
        const prev = measurements[i + 1]; // Previous measurement (older)
        return this.renderHistoryItem(m, prev);
      }).join('')}
    `;
  }

  private renderHistoryItem(m: BodyMeasurement, prev: BodyMeasurement | undefined): string {
    // Show weight and its change as primary info
    let primaryInfo = '';
    let changeInfo = '';

    if (m.weight !== null) {
      primaryInfo = `${m.weight} kg`;
      if (prev?.weight != null) {
        const diff = m.weight - prev.weight;
        if (diff !== 0) {
          const sign = diff > 0 ? '+' : '';
          changeInfo = `<span class="history-change ${diff > 0 ? 'up' : 'down'}">${sign}${diff.toFixed(1)}</span>`;
        }
      }
    }

    // Secondary info: count of other measurements taken
    const otherMeasurements = MEASUREMENT_FIELDS
      .filter(f => f.key !== 'weight' && m[f.key] !== null)
      .length;

    const secondaryInfo = otherMeasurements > 0
      ? `+${otherMeasurements} other measurement${otherMeasurements > 1 ? 's' : ''}`
      : '';

    return `
      <div class="history-item" onclick="app.showMeasurementDetail(${m.id})">
        <div class="history-item-date">${new Date(m.measured_at).toLocaleDateString()}</div>
        <div class="history-item-main">
          ${primaryInfo ? `<span class="history-weight">${primaryInfo}</span>` : ''}
          ${changeInfo}
        </div>
        ${secondaryInfo ? `<div class="history-item-secondary">${secondaryInfo}</div>` : ''}
      </div>
    `;
  }
}
