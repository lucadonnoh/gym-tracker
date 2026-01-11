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

    // Render summary with latest value for each field
    this.renderSummary(measurements);

    // Render charts
    try {
      await this.renderCharts(measurements);
    } catch (err) {
      console.error('Failed to render measurement charts:', err);
    }

    // Render history
    this.renderHistory(measurements);
  }

  private renderSummary(measurements: BodyMeasurement[]): void {
    if (!this.$measurementsSummary) return;

    if (measurements.length === 0) {
      this.$measurementsSummary.innerHTML = `
        <div class="text-center py-8 text-text-muted">
          <p>No measurements recorded yet</p>
          <p class="text-sm mt-1">Track your progress by adding your first measurement</p>
        </div>
      `;
      return;
    }

    // Get latest value for each field across all measurements
    const keyMetrics = this.getKeyMetrics(measurements);
    const latestDate = new Date(measurements[0].measured_at).toLocaleDateString();

    this.$measurementsSummary.innerHTML = `
      <div class="grid grid-cols-2 gap-2 mb-4">
        ${keyMetrics.map(m => `
          <div class="bg-surface border ${m.borderClass} rounded-lg p-3 text-center">
            <div class="text-xs text-text-muted uppercase tracking-wider mb-1">${m.label}</div>
            <div class="text-[1.75rem] font-bold">${m.value}<span class="text-base font-normal text-text-secondary ml-0.5">${m.unit}</span></div>
            ${m.change !== null ? `
              <div class="flex items-center justify-center gap-1 mt-1 text-[0.8125rem]">
                <span class="${m.arrowClass} font-semibold">${m.changeDirection}</span>
                <span class="font-semibold text-text-primary">${m.changeText}</span>
                <span class="text-text-muted text-xs">this month</span>
              </div>
            ` : `
              <div class="mt-1 text-[0.6875rem] text-text-muted italic">No prior data this month</div>
            `}
          </div>
        `).join('')}
      </div>
      <div class="text-center text-[0.8125rem] text-text-muted mb-6">Last measured: ${latestDate}</div>
    `;
  }

  private getKeyMetrics(measurements: BodyMeasurement[]): Array<{
    label: string;
    value: string;
    unit: string;
    change: number | null;
    changeText: string;
    changeDirection: string;
    borderClass: string;
    arrowClass: string;
  }> {
    const metrics: Array<{
      label: string;
      value: string;
      unit: string;
      change: number | null;
      changeText: string;
      changeDirection: string;
      borderClass: string;
      arrowClass: string;
    }> = [];

    // Fields where decrease is good (fat loss indicators)
    const decreaseIsGood = ['waist', 'hips'];
    // Fields where change is neutral (depends on goals)
    const neutralChange = ['weight'];

    // Get first day of current month for comparison
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Iterate over all measurement fields
    for (const field of MEASUREMENT_FIELDS) {
      // Find the latest measurement that has this field
      const latestWithField = measurements.find(m => m[field.key] !== null);
      if (!latestWithField) continue;

      const value = latestWithField[field.key] as number;

      // Find the first measurement of the current month that has this field
      // (oldest measurement in current month, i.e., closest to start of month)
      let oldValue: number | null = null;
      const currentMonthMeasurements = measurements.filter(m => {
        const mDate = new Date(m.measured_at);
        return mDate >= startOfMonth && m[field.key] !== null;
      });
      if (currentMonthMeasurements.length > 1) {
        // Get the oldest one (last in the filtered array since sorted desc)
        const firstOfMonth = currentMonthMeasurements[currentMonthMeasurements.length - 1];
        oldValue = firstOfMonth[field.key] as number;
      }

      const change = oldValue != null ? value - oldValue : null;

      let borderClass = 'border-border';
      let arrowClass = 'text-text-muted';

      if (change !== null && change !== 0) {
        if (neutralChange.includes(field.key)) {
          // Weight: just show direction with accent color
          borderClass = 'border-accent';
          arrowClass = 'text-accent';
        } else if (decreaseIsGood.includes(field.key)) {
          // Waist/Hips: down is good (green), up is bad (red)
          borderClass = change > 0 ? 'border-danger' : 'border-accent';
          arrowClass = change > 0 ? 'text-danger' : 'text-accent';
        } else {
          // Muscle measurements: up is good (green), down is bad (red)
          borderClass = change > 0 ? 'border-accent' : 'border-danger';
          arrowClass = change > 0 ? 'text-accent' : 'text-danger';
        }
      }

      metrics.push({
        label: field.label,
        value: value.toFixed(1),
        unit: field.unit,
        change,
        changeText: change !== null ? `${Math.abs(change).toFixed(1)} ${field.unit}` : '',
        changeDirection: change !== null ? (change > 0 ? '↑' : change < 0 ? '↓' : '→') : '',
        borderClass,
        arrowClass
      });
    }

    return metrics;
  }

  private async renderCharts(measurements: BodyMeasurement[]): Promise<void> {
    if (!this.$measurementsCharts) return;

    if (measurements.length < 2) {
      this.$measurementsCharts.innerHTML = `
        <div class="text-center py-6 text-text-muted text-sm">
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
        <div class="bg-surface border border-border rounded-lg p-4 mb-4">
          <div class="text-[0.8125rem] font-medium text-text-secondary mb-2">${f.label}</div>
          <div class="h-[150px]"><canvas id="chart-${f.key}"></canvas></div>
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
      this.$measurementsHistory.innerHTML = '<p class="text-center py-6 text-text-muted">No measurements yet</p>';
      return;
    }

    this.$measurementsHistory.innerHTML = `
      <h3 class="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">History</h3>
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
          const colorClass = diff > 0 ? 'text-accent' : 'text-danger';
          changeInfo = `<span class="${colorClass} text-sm font-medium ml-2">${sign}${diff.toFixed(1)}</span>`;
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
      <div class="bg-surface border border-border rounded-lg p-4 mb-2 cursor-pointer active:bg-surface-elevated" onclick="app.showMeasurementDetail(${m.id})">
        <div class="font-semibold text-[0.9375rem]">${new Date(m.measured_at).toLocaleDateString()}</div>
        <div class="flex items-center">
          ${primaryInfo ? `<span class="text-text-secondary">${primaryInfo}</span>` : ''}
          ${changeInfo}
        </div>
        ${secondaryInfo ? `<div class="text-[0.8125rem] text-text-muted mt-1">${secondaryInfo}</div>` : ''}
      </div>
    `;
  }
}
