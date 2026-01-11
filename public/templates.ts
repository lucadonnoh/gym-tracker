// HTML template rendering functions with Tailwind CSS

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
    // Compare calendar dates, not elapsed time
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
    const diffDays = Math.round((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      daysAgoText = 'today';
    } else if (diffDays === 1) {
      daysAgoText = 'yesterday';
    } else {
      daysAgoText = `${diffDays} days ago`;
    }
  }
  return `
    <button class="w-full p-4 bg-surface border border-border rounded-lg text-left flex justify-between items-center active:bg-surface-elevated" onclick="app.startSession(${day.id})">
      <span class="font-semibold text-text-primary">${day.display_name}</span>
      ${daysAgoText ? `<span class="text-sm text-text-muted">${daysAgoText}</span>` : ''}
    </button>
  `;
}

export function renderHistoryItem(session: Session): string {
  const started = new Date(session.started_at);
  const ended = session.ended_at ? new Date(session.ended_at) : null;
  const duration = ended ? formatDuration(ended.getTime() - started.getTime()) : 'In progress';

  // Build PR badges by type
  const prBadges: string[] = [];
  const s = (n: number) => n > 1 ? 's' : '';
  if (session.volume_prs && session.volume_prs > 0)
    prBadges.push(`<span class="px-1.5 py-0.5 bg-gold text-black text-[0.625rem] font-semibold rounded">${session.volume_prs} Vol PR${s(session.volume_prs)}</span>`);
  if (session.set_prs && session.set_prs > 0)
    prBadges.push(`<span class="px-1.5 py-0.5 bg-orange-500 text-black text-[0.625rem] font-semibold rounded">${session.set_prs} Set PR${s(session.set_prs)}</span>`);
  if (session.weight_prs && session.weight_prs > 0)
    prBadges.push(`<span class="px-1.5 py-0.5 bg-pink-500 text-black text-[0.625rem] font-semibold rounded">${session.weight_prs} 1RM${s(session.weight_prs)}</span>`);
  if (session.reps_prs && session.reps_prs > 0)
    prBadges.push(`<span class="px-1.5 py-0.5 bg-purple-500 text-black text-[0.625rem] font-semibold rounded">${session.reps_prs} Reps PR${s(session.reps_prs)}</span>`);

  return `
    <div class="bg-surface border border-border rounded-lg p-4 mb-2 cursor-pointer active:bg-surface-elevated" onclick="app.showSessionDetail(${session.id})">
      <div class="flex items-center justify-between mb-0.5">
        <span class="font-semibold text-[0.9375rem]">${started.toLocaleDateString()}</span>
        ${prBadges.length > 0 ? `<div class="flex gap-1">${prBadges.join('')}</div>` : ''}
      </div>
      <div class="text-text-secondary text-sm">${session.day_display_name}</div>
      <div class="text-[0.8125rem] text-text-muted mt-1">${duration}</div>
    </div>
  `;
}

export function renderSessionSummary(totalVolume: number, exerciseCount: number, totalPRs: number): string {
  return `
    <div class="flex gap-4 mb-6 p-4 bg-surface border border-border rounded-lg">
      <div class="flex-1 text-center">
        <span class="block text-2xl font-bold text-text-primary">${totalVolume.toLocaleString()}</span>
        <span class="text-xs text-text-muted uppercase tracking-wider">kg total</span>
      </div>
      <div class="flex-1 text-center">
        <span class="block text-2xl font-bold text-text-primary">${exerciseCount}</span>
        <span class="text-xs text-text-muted uppercase tracking-wider">exercises</span>
      </div>
      ${totalPRs > 0 ? `
        <div class="flex-1 text-center">
          <span class="block text-2xl font-bold text-gold">${totalPRs}</span>
          <span class="text-xs text-text-muted uppercase tracking-wider">PR${totalPRs > 1 ? 's' : ''}</span>
        </div>
      ` : ''}
    </div>
  `;
}

// Set badge for history (click to edit)
export function renderSetBadge(setId: number, weight: number, reps: number, exerciseId: number): string {
  return `<span id="set-${setId}" class="inline-block px-2 py-1 bg-black border border-border rounded text-sm cursor-pointer" onclick="app.editSetInline(${setId}, ${exerciseId}, null, ${weight}, ${reps})">${weight}kg x ${reps}</span>`;
}

// Inline editor for history (same visual as session row)
export function renderHistorySetEditor(setId: number | null, exerciseId: number, setNumber: number | null, weight: number, reps: number): string {
  return `
    <div id="set-editor" class="flex items-center gap-2 p-3 bg-accent-surface border-accent border rounded-lg">
      <input type="number" id="edit-reps" class="w-14 p-2 bg-black border border-accent rounded text-center text-sm" value="${reps || ''}" inputmode="numeric" onfocus="this.select()">
      <span class="text-xs text-text-muted">reps</span>
      <input type="text" id="edit-weight" class="w-16 p-2 bg-black border border-accent rounded text-center text-sm" value="${weight || ''}" inputmode="decimal" onfocus="this.select()">
      <span class="text-xs text-text-muted">kg</span>
      <button class="ml-auto w-10 h-10 bg-accent text-black font-bold rounded-lg" onclick="app.saveSetInline(${setId}, ${exerciseId}, ${setNumber})">✓</button>
      ${setId ? `<button class="w-10 h-10 bg-danger text-white font-bold rounded-lg" onclick="app.deleteSetInline(${setId})">✕</button>` : ''}
    </div>`;
}

export function renderSessionDetailExercise(ex: ExerciseWithSets, stats: ExerciseStats | undefined): string {
  const sets = ex.sets || [];
  const volume = stats?.volume || 0;
  const prs = stats?.prs || { volume: false, setVolume: false, weight: false, reps: false };
  const hasPR = prs.volume || prs.setVolume || prs.weight || prs.reps;

  const prBadges: string[] = [];
  if (prs.volume) prBadges.push('<span class="px-2 py-0.5 bg-gold text-black text-[0.6875rem] font-semibold uppercase rounded">Vol PR</span>');
  if (prs.setVolume) prBadges.push('<span class="px-2 py-0.5 bg-orange-500 text-black text-[0.6875rem] font-semibold uppercase rounded">Set PR</span>');
  if (prs.weight) prBadges.push('<span class="px-2 py-0.5 bg-pink-500 text-black text-[0.6875rem] font-semibold uppercase rounded">1RM</span>');
  if (prs.reps) prBadges.push('<span class="px-2 py-0.5 bg-purple-500 text-black text-[0.6875rem] font-semibold uppercase rounded">Reps PR</span>');

  const setsHtml = sets.map(s => renderSetBadge(s.id, s.weight ?? 0, s.reps ?? 0, ex.id)).join(' ');
  const nextSetNumber = sets.length + 1;

  return `
    <div class="bg-surface border ${hasPR ? 'border-gold' : 'border-border'} rounded-lg p-4 mb-3">
      <div class="flex justify-between items-start mb-2 cursor-pointer" onclick="app.showProgressForExercise(${ex.id})">
        <span class="font-semibold text-text-primary">${ex.name}</span>
        <div class="flex gap-1 flex-wrap">${prBadges.join('')}</div>
      </div>
      <div class="text-sm text-text-secondary mb-3">${volume.toLocaleString()} kg</div>
      <div class="flex flex-wrap gap-2" id="sets-container-${ex.id}">
        ${setsHtml}
        <span id="add-set-${ex.id}" class="inline-block px-2 py-1 border border-dashed border-accent text-accent rounded text-sm cursor-pointer" onclick="app.editSetInline(null, ${ex.id}, ${nextSetNumber})">+ Add</span>
      </div>
    </div>
  `;
}

export function renderManageExercise(ex: Exercise): string {
  return `
    <div class="flex items-center justify-between p-4 bg-surface border border-border rounded-lg mb-2">
      <div class="flex-1 min-w-0 mr-4">
        <div class="font-medium text-text-primary truncate">${ex.name}</div>
        <div class="text-sm text-text-muted truncate">${ex.description || ''} ${ex.default_weight ? `(${ex.default_weight}kg)` : ''}</div>
      </div>
      <div class="flex gap-2">
        <button class="px-3 py-1.5 bg-transparent border border-border text-text-secondary rounded text-sm" onclick="app.editExercise(${ex.id})">Edit</button>
        <button class="px-3 py-1.5 bg-transparent border border-danger-dim text-danger rounded text-sm" onclick="app.deleteExercise(${ex.id})">Delete</button>
      </div>
    </div>
  `;
}

export function renderVolumeDisplay(currentVolume: number, lastVolume: number | null | undefined): string {
  if (currentVolume <= 0) {
    if (lastVolume && lastVolume > 0) {
      return `
        <div class="flex items-baseline gap-2 text-sm">
          <span class="text-text-dim">— kg</span>
          <span class="text-text-muted text-xs">(last: ${lastVolume.toFixed(0)} kg)</span>
        </div>
      `;
    }
    return `
      <div class="flex items-baseline gap-2 text-sm">
        <span class="text-text-dim">— kg</span>
      </div>
    `;
  }

  let volumeChange: string | null = null;
  let changeClass = '';
  if (lastVolume && lastVolume > 0) {
    const changePercent = ((currentVolume - lastVolume) / lastVolume) * 100;
    if (changePercent > 0) {
      volumeChange = `+${changePercent.toFixed(0)}%`;
      changeClass = 'text-accent';
    } else if (changePercent < 0) {
      volumeChange = `${changePercent.toFixed(0)}%`;
      changeClass = 'text-danger';
    } else {
      volumeChange = '0%';
      changeClass = 'text-text-muted';
    }
  }

  return `
    <div class="flex items-baseline gap-2 text-sm">
      <span class="font-semibold text-text-primary">${currentVolume.toFixed(0)} kg</span>
      ${volumeChange ? `<span class="${changeClass} text-xs font-medium">${volumeChange}</span>` : ''}
      ${lastVolume ? `<span class="text-text-muted text-xs">(last: ${lastVolume.toFixed(0)} kg)</span>` : ''}
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

  const showReps = isLogged ? reps : (isMax ? '' : expected.reps);
  const repsPlaceholder = isMax ? placeholderReps : expected.reps;

  const rowBg = isLogged ? 'bg-accent-surface border-accent' : 'bg-surface border-border';

  return `
    <div class="flex items-center gap-2 p-3 ${rowBg} border rounded-lg" data-exercise="${exercise.id}" data-set="${expected.setNumber}">
      <span class="text-sm text-text-muted w-12">Set ${expected.setNumber}</span>
      <input type="number" class="w-14 p-2 bg-black border border-border rounded text-center text-sm ${isLogged ? 'border-accent' : ''}"
        value="${showReps}"
        inputmode="numeric"
        placeholder="${repsPlaceholder}"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber}, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${expected.setNumber}\\'] .weight-input').value, this.value)">
      <span class="text-xs text-text-muted">reps</span>
      <input type="text" class="weight-input w-16 p-2 bg-black border border-border rounded text-center text-sm ${isLogged ? 'border-accent' : ''}"
        value="${showValue}"
        inputmode="decimal"
        placeholder="${placeholderWeight}"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber}, this.value, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${expected.setNumber}\\'] input[type=number]').value)">
      <span class="text-xs text-text-muted">kg</span>
      ${!isLogged ? `<button class="ml-auto w-10 h-10 bg-accent text-black font-bold rounded-lg" onclick="app.confirmSet(${exercise.id}, ${expected.setNumber}, ${confirmWeight}, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${expected.setNumber}\\'] input[type=number]').value || ${confirmReps})">✓</button>` : ''}
    </div>
  `;
}

function renderDropsetRow(exercise: ExerciseWithSets, expected: ParsedSet, lastSets: SetLog[]): string {
  const loggedSets = exercise.sets || [];
  const dropsetData: { weight: number | string; reps: number | string; logged: boolean; placeholderWeight: string; placeholderReps: number; defaultReps: number }[] = [];

  const repsArray = typeof expected.reps === 'string'
    ? expected.reps.split('-').map(r => parseInt(r) || 10)
    : [expected.reps];

  for (let i = 0; i < (expected.dropsetParts || 0); i++) {
    const subSetNum = expected.setNumber + i * 0.1;
    const subLogged = loggedSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
    const lastSet = lastSets.find(s => Math.abs(s.set_number - subSetNum) < 0.01);
    const defaultReps = repsArray[i] ?? repsArray[0] ?? 10;
    dropsetData.push({
      weight: subLogged?.weight ?? '',
      reps: subLogged?.reps ?? '',
      logged: subLogged?.weight !== null && subLogged?.weight !== undefined,
      placeholderWeight: lastSet?.weight?.toString() || 'kg',
      placeholderReps: lastSet?.reps || defaultReps,
      defaultReps
    });
  }

  const allDropsetLogged = dropsetData.every(d => d.logged);
  const setId = `dropset-${exercise.id}-${expected.setNumber}`;
  const rowBg = allDropsetLogged ? 'bg-accent-surface border-accent' : 'bg-surface border-border';

  return `
    <div class="p-3 ${rowBg} border rounded-lg" data-exercise="${exercise.id}" data-set="${expected.setNumber}">
      <div class="flex items-center justify-between mb-2">
        <span class="text-sm text-text-muted">Set ${expected.setNumber}</span>
        ${!allDropsetLogged ? `<button class="w-10 h-10 bg-accent text-black font-bold rounded-lg" onclick="app.confirmDropset(${exercise.id}, ${expected.setNumber}, '${setId}', ${expected.dropsetParts})">✓</button>` : ''}
      </div>
      <div class="flex flex-col gap-2">
        ${dropsetData.map((d, i) => `
          <div class="flex items-center gap-2" data-drop="${i}">
            <input type="number" class="w-14 p-2 bg-black border border-border rounded text-center text-sm ${d.logged ? 'border-accent' : ''}"
              id="${setId}-reps-${i}"
              value="${d.logged ? d.reps : ''}"
              inputmode="numeric"
              placeholder="${d.placeholderReps}"
              onfocus="this.select()"
              onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber + i * 0.1}, document.getElementById('${setId}-weight-${i}').value, this.value, true)">
            <span class="text-text-muted">×</span>
            <input type="text" class="w-16 p-2 bg-black border border-border rounded text-center text-sm ${d.logged ? 'border-accent' : ''}"
              id="${setId}-weight-${i}"
              value="${d.logged ? d.weight : ''}"
              inputmode="decimal"
              placeholder="${d.placeholderWeight}"
              onfocus="this.select()"
              onchange="app.logSetWeight(${exercise.id}, ${expected.setNumber + i * 0.1}, this.value, document.getElementById('${setId}-reps-${i}').value || ${d.defaultReps}, true)">
            <span class="text-xs text-text-muted">kg</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

export function renderExtraSetRow(exercise: ExerciseWithSets, logged: SetLog): string {
  return `
    <div class="flex items-center gap-2 p-3 bg-accent-surface border border-accent rounded-lg" data-exercise="${exercise.id}" data-set="${logged.set_number}">
      <span class="text-sm text-text-muted w-12">Set ${logged.set_number}</span>
      <input type="number" class="w-14 p-2 bg-black border border-accent rounded text-center text-sm"
        value="${logged.reps || 10}"
        inputmode="numeric"
        placeholder="reps"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exercise.id}, ${logged.set_number}, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${logged.set_number}\\'] .weight-input').value, this.value)">
      <span class="text-xs text-text-muted">reps</span>
      <input type="text" class="weight-input w-16 p-2 bg-black border border-accent rounded text-center text-sm"
        value="${logged.weight ?? ''}"
        inputmode="decimal"
        placeholder="kg"
        onfocus="this.select()"
        onchange="app.logSetWeight(${exercise.id}, ${logged.set_number}, this.value, document.querySelector('[data-exercise=\\'${exercise.id}\\'][data-set=\\'${logged.set_number}\\'] input[type=number]').value)">
      <span class="text-xs text-text-muted">kg</span>
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

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const weekDaysHtml = dayLabels.map((label, i) => {
    const jsDay = [1, 2, 3, 4, 5, 6, 0][i];
    const isCompleted = workoutDays.includes(jsDay);
    const isToday = new Date().getDay() === jsDay;
    const bgClass = isCompleted ? 'bg-accent text-black' : 'bg-surface text-text-muted';
    const borderClass = isToday ? 'ring-2 ring-accent ring-offset-1 ring-offset-black' : '';
    return `<div class="w-8 h-8 flex items-center justify-center rounded text-xs font-medium ${bgClass} ${borderClass}">${label}</div>`;
  }).join('');

  return `
    <div class="mb-6">
      <div class="grid grid-cols-3 gap-3 mb-4">
        <div class="bg-surface border border-border rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-text-primary">${stats.totalWorkouts}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">workouts</div>
        </div>
        <div class="bg-surface border border-border rounded-lg p-3 text-center">
          <div class="text-2xl font-bold text-text-primary">${stats.totalHours}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">hours</div>
        </div>
        <div class="bg-surface border ${stats.streak.current > 0 ? 'border-accent' : 'border-border'} rounded-lg p-3 text-center">
          <div class="text-2xl font-bold ${stats.streak.current > 0 ? 'text-accent' : 'text-text-primary'}">${stats.streak.current}</div>
          <div class="text-xs text-text-muted uppercase tracking-wider">week streak</div>
        </div>
      </div>

      <div class="bg-surface border border-border rounded-lg p-4">
        <div class="flex justify-between items-center mb-3">
          <span class="text-sm font-medium text-text-secondary">This Week</span>
          <button class="px-3 py-1 bg-black border border-border rounded text-sm text-text-primary" onclick="app.editWeeklyGoal()">${workoutDays.length}/${stats.weeklyGoal}</button>
        </div>
        <div class="flex justify-between">${weekDaysHtml}</div>
        ${weekComplete ? '<div class="mt-3 text-center text-sm text-accent font-medium">Week completed!</div>' : ''}
      </div>
    </div>
  `;
}

export function renderWeeklyGoalModal(currentGoal: number): string {
  const options = [1, 2, 3, 4, 5, 6, 7].map(n =>
    `<button class="p-3 ${n === currentGoal ? 'bg-accent text-black' : 'bg-surface text-text-primary'} border border-border rounded-lg font-medium" onclick="app.setWeeklyGoal(${n})">${n}x/week</button>`
  ).join('');

  return `
    <div class="text-center">
      <h3 class="text-lg font-semibold mb-2">Weekly Goal</h3>
      <p class="text-sm text-text-secondary mb-4">How many times per week do you want to work out?</p>
      <div class="grid grid-cols-4 gap-2 mb-4">${options}</div>
      <button class="w-full p-3 bg-black border border-border text-text-secondary rounded-lg" onclick="app.closeWeeklyGoalModal()">Cancel</button>
    </div>
  `;
}

export const LOADING_HTML = '<p class="text-center text-text-muted py-8">Loading...</p>';
