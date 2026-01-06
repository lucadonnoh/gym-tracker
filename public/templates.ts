// HTML template rendering functions

import type {
  WorkoutDay,
  Exercise,
  Session,
  ExerciseWithSets,
  ExerciseStats,
  ParsedSet,
  SetLog,
  SummaryStats
} from './types.js';

export function renderDayButton(day: WorkoutDay): string {
  let daysAgoText = '';
  if (day.last_session_date) {
    const lastDate = new Date(day.last_session_date);
    const now = new Date();
    const diffTime = now.getTime() - lastDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      daysAgoText = 'today';
    } else if (diffDays === 1) {
      daysAgoText = '1 day ago';
    } else {
      daysAgoText = `${diffDays} days ago`;
    }
  }
  return `
    <button class="day-btn" onclick="app.startSession(${day.id})">
      <span class="day-name">${day.display_name}</span>
      ${daysAgoText ? `<span class="day-last">${daysAgoText}</span>` : ''}
    </button>
  `;
}

export function renderHistoryItem(session: Session): string {
  const started = new Date(session.started_at);
  const ended = session.ended_at ? new Date(session.ended_at) : null;
  const duration = ended ? formatDuration(ended.getTime() - started.getTime()) : 'In progress';

  return `
    <div class="history-item" onclick="app.showSessionDetail(${session.id})">
      <div class="history-date">${started.toLocaleDateString()}</div>
      <div class="history-day">${session.day_display_name}</div>
      <div class="history-duration">${duration}</div>
    </div>
  `;
}

export function renderSessionSummary(totalVolume: number, exerciseCount: number, totalPRs: number): string {
  return `
    <div class="session-summary">
      <div class="summary-stat">
        <span class="summary-value">${totalVolume.toLocaleString()}</span>
        <span class="summary-label">kg total</span>
      </div>
      <div class="summary-stat">
        <span class="summary-value">${exerciseCount}</span>
        <span class="summary-label">exercises</span>
      </div>
      ${totalPRs > 0 ? `
        <div class="summary-stat pr">
          <span class="summary-value">${totalPRs}</span>
          <span class="summary-label">PR${totalPRs > 1 ? 's' : ''}</span>
        </div>
      ` : ''}
    </div>
  `;
}

export function renderSessionDetailExercise(ex: ExerciseWithSets, stats: ExerciseStats | undefined): string {
  const sets = ex.sets || [];
  const volume = stats?.volume || 0;
  const prs = stats?.prs || { volume: false, setVolume: false, weight: false, reps: false };
  const hasPR = prs.volume || prs.setVolume || prs.weight || prs.reps;

  const prBadges: string[] = [];
  if (prs.volume) prBadges.push('<span class="pr-badge pr-volume">Vol PR</span>');
  if (prs.setVolume) prBadges.push('<span class="pr-badge pr-set">Set PR</span>');
  if (prs.weight) prBadges.push('<span class="pr-badge pr-weight">1RM</span>');
  if (prs.reps) prBadges.push('<span class="pr-badge pr-reps">Reps PR</span>');

  const setsHtml = sets.map(s => `<span class="detail-set" onclick="app.openEditSetModal(${s.id}, ${s.weight ?? 0}, ${s.reps ?? 0})">${s.weight ?? '?'}kg x ${s.reps ?? '?'}</span>`).join(' ');
  const nextSetNumber = sets.length + 1;

  return `
    <div class="detail-exercise ${hasPR ? 'has-pr' : ''}">
      <div class="detail-exercise-header" onclick="app.showProgressForExercise(${ex.id})">
        <span class="detail-exercise-name">${ex.name}</span>
        <div class="pr-badges">${prBadges.join('')}</div>
      </div>
      <div class="detail-exercise-volume">${volume.toLocaleString()} kg</div>
      <div class="detail-sets">
        ${setsHtml}
        <span class="detail-set add-set" onclick="app.openAddSetModal(${ex.id}, ${nextSetNumber})">+ Add</span>
      </div>
    </div>
  `;
}

export function renderManageExercise(ex: Exercise): string {
  return `
    <div class="manage-exercise">
      <div class="manage-exercise-info">
        <div class="manage-exercise-name">${ex.name}</div>
        <div class="manage-exercise-desc">${ex.description || ''} ${ex.default_weight ? `(${ex.default_weight}kg)` : ''}</div>
      </div>
      <div class="manage-actions">
        <button onclick="app.editExercise(${ex.id})">Edit</button>
        <button class="delete-btn" onclick="app.deleteExercise(${ex.id})">Delete</button>
      </div>
    </div>
  `;
}

export function renderVolumeDisplay(currentVolume: number, lastVolume: number | null | undefined): string {
  // Always render container to prevent layout shift when volume appears
  if (currentVolume <= 0) {
    // Show placeholder with last volume info if available
    if (lastVolume && lastVolume > 0) {
      return `
        <div class="volume-display">
          <span class="volume-total volume-placeholder">— kg</span>
          <span class="volume-last">(last: ${lastVolume.toFixed(0)} kg)</span>
        </div>
      `;
    }
    // No data at all - still reserve space with minimal placeholder
    return `
      <div class="volume-display">
        <span class="volume-total volume-placeholder">— kg</span>
      </div>
    `;
  }

  let volumeChange: string | null = null;
  if (lastVolume && lastVolume > 0) {
    const changePercent = ((currentVolume - lastVolume) / lastVolume) * 100;
    if (changePercent > 0) {
      volumeChange = `+${changePercent.toFixed(0)}%`;
    } else if (changePercent < 0) {
      volumeChange = `${changePercent.toFixed(0)}%`;
    } else {
      volumeChange = '0%';
    }
  }

  return `
    <div class="volume-display">
      <span class="volume-total">${currentVolume.toFixed(0)} kg</span>
      ${volumeChange ? `<span class="volume-change ${volumeChange.startsWith('+') ? 'up' : volumeChange.startsWith('-') ? 'down' : ''}">${volumeChange}</span>` : ''}
      ${lastVolume ? `<span class="volume-last">(last: ${lastVolume.toFixed(0)} kg)</span>` : ''}
    </div>
  `;
}

export function renderSetRow(
  exercise: ExerciseWithSets,
  expected: ParsedSet,
  logged: SetLog | undefined,
  lastSets: SetLog[]
): string {
  const weight = logged?.weight ?? exercise.default_weight ?? '';
  const reps = logged?.reps ?? (typeof expected.reps === 'number' ? expected.reps : '');
  const isMax = expected.reps === 'max';
  const isLogged = logged && logged.weight !== null;

  if (expected.isDropset && expected.dropsetParts) {
    return renderDropsetRow(exercise, expected, lastSets);
  }

  const showValue = isLogged ? weight : '';
  const lastSet = lastSets.find(s => s.set_number === expected.setNumber);
  const placeholderWeight = lastSet?.weight?.toString() || exercise.default_weight?.toString() || 'kg';
  const placeholderReps = lastSet?.reps?.toString() || 'reps';
  const confirmWeight = lastSet?.weight || exercise.default_weight || 0;
  const confirmReps = isMax ? (lastSet?.reps || null) : expected.reps;

  return `
    <div class="set-row ${isLogged ? 'logged' : ''}" data-exercise="${exercise.id}" data-set="${expected.setNumber}">
      <span class="set-label">Set ${expected.setNumber}</span>
      <span class="set-reps">${isMax ? 'max' : expected.reps} reps</span>
      ${isMax ? `
        <input type="number" class="reps-input ${isLogged ? 'filled' : ''}"
          value="${isLogged ? reps : ''}"
          inputmode="numeric"
          placeholder="${placeholderReps}"
          onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber}, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${expected.setNumber}\\'] .weight-input').value, this.value)">
      ` : ''}
      <input type="number" class="weight-input ${isLogged ? 'filled' : ''}"
        value="${showValue}"
        step="0.5"
        inputmode="decimal"
        placeholder="${placeholderWeight}"
        onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber}, this.value, ${isMax ? `document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${expected.setNumber}\\'] .reps-input').value` : expected.reps})">
      <span class="weight-unit">kg</span>
      ${!isLogged ? `<button class="confirm-btn" onclick="app.confirmSet(${exercise.id}, ${expected.setNumber}, ${confirmWeight}, ${confirmReps})">✓</button>` : ''}
    </div>
  `;
}

function renderDropsetRow(exercise: ExerciseWithSets, expected: ParsedSet, lastSets: SetLog[]): string {
  const loggedSets = exercise.sets || [];
  const dropsetData: { weight: number | string; logged: boolean; placeholder: string; reps: number }[] = [];

  // Parse reps from the expected.reps string (e.g., "10-10-10" -> [10, 10, 10])
  const repsArray = typeof expected.reps === 'string'
    ? expected.reps.split('-').map(r => parseInt(r) || 10)
    : [expected.reps];

  for (let i = 0; i < (expected.dropsetParts || 0); i++) {
    const subSetNum = expected.setNumber + i * 0.1;
    const subLogged = loggedSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
    const lastSet = lastSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
    dropsetData.push({
      weight: subLogged?.weight ?? '',
      logged: subLogged?.weight !== null && subLogged?.weight !== undefined,
      placeholder: lastSet?.weight?.toString() || 'kg',
      reps: repsArray[i] ?? repsArray[0] ?? 10
    });
  }

  const allDropsetLogged = dropsetData.every(d => d.logged);

  return `
    <div class="set-row ${allDropsetLogged ? 'logged' : ''}" data-exercise="${exercise.id}" data-set="${expected.setNumber}">
      <span class="set-label">Set ${expected.setNumber}</span>
      <span class="set-reps">${expected.reps}</span>
      <div class="dropset-weights">
        ${dropsetData.map((d, i) => `
          <input type="number" class="weight-input dropset-weight ${d.logged ? 'filled' : ''}"
            data-dropset-index="${i}"
            value="${d.logged ? d.weight : ''}"
            step="0.5"
            inputmode="decimal"
            placeholder="${d.placeholder}"
            onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber + i * 0.1}, this.value, ${d.reps}, true)">
        `).join('')}
      </div>
      <span class="weight-unit">kg</span>
    </div>
  `;
}

export function renderExtraSetRow(exercise: ExerciseWithSets, logged: SetLog): string {
  return `
    <div class="set-row logged" data-exercise="${exercise.id}" data-set="${logged.set_number}">
      <span class="set-label">Set ${logged.set_number}</span>
      <span class="set-reps">extra</span>
      <input type="number" class="weight-input"
        value="${logged.weight ?? ''}"
        step="0.5"
        inputmode="decimal"
        placeholder="kg"
        onchange="app.logSetWeight(${exercise.id}, ${logged.set_number}, this.value, ${logged.reps || 10})">
      <span class="weight-unit">kg</span>
    </div>
  `;
}

// Helper functions
export function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export function formatTimer(elapsed: number): string {
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function renderSummaryStats(stats: SummaryStats): string {
  const workoutDays = stats.currentWeekWorkouts.map(w => w.dayOfWeek);
  const weekComplete = workoutDays.length >= stats.weeklyGoal;

  // Generate week days (M-T-W-T-F-S-S)
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  // Sunday = 0, need to map to Monday = 0
  const dayMapping = [6, 0, 1, 2, 3, 4, 5]; // Maps JS day (0=Sun) to display index (0=Mon)

  const weekDaysHtml = dayLabels.map((label, i) => {
    const jsDay = [1, 2, 3, 4, 5, 6, 0][i]; // Convert display index to JS day
    const isCompleted = workoutDays.includes(jsDay);
    const isToday = new Date().getDay() === jsDay;
    return `<div class="week-day ${isCompleted ? 'completed' : ''} ${isToday ? 'today' : ''}">${label}</div>`;
  }).join('');

  return `
    <div class="summary-stats">
      <div class="stats-row">
        <div class="stat-box">
          <div class="stat-value">${stats.totalWorkouts}</div>
          <div class="stat-label">workouts</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${stats.totalHours}</div>
          <div class="stat-label">hours</div>
        </div>
        <div class="stat-box streak ${stats.streak.current > 0 ? 'active' : ''}">
          <div class="stat-value">${stats.streak.current}</div>
          <div class="stat-label">week streak</div>
        </div>
      </div>

      <div class="weekly-progress">
        <div class="weekly-header">
          <span class="weekly-title">This Week</span>
          <button class="weekly-goal-btn" onclick="app.editWeeklyGoal()">${workoutDays.length}/${stats.weeklyGoal}</button>
        </div>
        <div class="week-days">${weekDaysHtml}</div>
        ${weekComplete ? '<div class="week-complete">Week completed!</div>' : ''}
      </div>
    </div>
  `;
}

export function renderWeeklyGoalModal(currentGoal: number): string {
  const options = [1, 2, 3, 4, 5, 6, 7].map(n =>
    `<button class="goal-option ${n === currentGoal ? 'selected' : ''}" onclick="app.setWeeklyGoal(${n})">${n}x/week</button>`
  ).join('');

  return `
    <div class="goal-modal-content">
      <h3>Weekly Goal</h3>
      <p>How many times per week do you want to work out?</p>
      <div class="goal-options">${options}</div>
      <button class="goal-cancel-btn" onclick="app.closeWeeklyGoalModal()">Cancel</button>
    </div>
  `;
}

export const LOADING_HTML = '<p style="text-align:center;color:#999;padding:2rem;">Loading...</p>';
