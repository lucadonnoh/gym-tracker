import type { ParsedSet, SetGroup } from './types';

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

export function daysAgoText(dateStr: string): string {
  const lastDate = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDay = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate());
  const diffDays = Math.round((today.getTime() - lastDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export function parseSetScheme(description: string | null): ParsedSet[] {
  if (!description) return [{ setNumber: 1, reps: 10, isDropset: false }];

  const sets: ParsedSet[] = [];
  let setNumber = 1;
  const parts = description.split(',').map(p => p.trim());

  for (const part of parts) {
    const match = part.match(/(\d+)\s*x\s*(\d+(?:-\d+)*|max)((?:\+max)*)/i);
    if (match) {
      const count = parseInt(match[1]);
      const repsStr = match[2].toLowerCase();
      const maxSuffix = match[3] || '';

      if (repsStr === 'max') {
        for (let i = 0; i < count; i++) {
          sets.push({ setNumber: setNumber++, reps: 'max', isDropset: false });
        }
      } else if (repsStr.includes('-')) {
        const dropsetParts = repsStr.split('-').length;
        for (let i = 0; i < count; i++) {
          sets.push({ setNumber: setNumber++, reps: repsStr, isDropset: true, dropsetParts });
        }
      } else {
        const reps = parseInt(repsStr);
        for (let i = 0; i < count; i++) {
          sets.push({ setNumber: setNumber++, reps, isDropset: false });
        }
      }

      if (maxSuffix) {
        const maxCount = (maxSuffix.match(/\+max/gi) || []).length;
        for (let i = 0; i < maxCount; i++) {
          sets.push({ setNumber: setNumber++, reps: 'max', isDropset: false });
        }
      }
    }
  }

  if (sets.length === 0) {
    return [
      { setNumber: 1, reps: 10, isDropset: false },
      { setNumber: 2, reps: 10, isDropset: false },
      { setNumber: 3, reps: 10, isDropset: false }
    ];
  }

  return sets;
}

export function parseDescriptionToGroups(description: string | null): SetGroup[] {
  if (!description) return [{ count: 3, reps: 10, isDropset: false }];

  const groups: SetGroup[] = [];
  const parts = description.split(',').map(p => p.trim());

  for (const part of parts) {
    const match = part.match(/(\d+)\s*x\s*(\d+(?:-\d+)*|max)((?:\+max)*)/i);
    if (match) {
      const count = parseInt(match[1]);
      const repsStr = match[2].toLowerCase();
      const maxSuffix = match[3] || '';

      let group: SetGroup;
      if (repsStr === 'max') {
        group = { count, reps: 'max', isDropset: false };
      } else if (repsStr.includes('-')) {
        const dropCount = repsStr.split('-').length;
        const reps = parseInt(repsStr.split('-')[0]);
        group = { count, reps, isDropset: true, dropsetCount: dropCount };
      } else {
        group = { count, reps: parseInt(repsStr), isDropset: false };
      }

      if (maxSuffix) {
        const maxCount = (maxSuffix.match(/\+max/gi) || []).length;
        if (maxCount > 0) {
          group.maxCount = maxCount;
        }
      }

      const noteMatch = part.match(/\(([^)]+)\)/);
      if (noteMatch) {
        group.note = noteMatch[1];
      }

      groups.push(group);
    }
  }

  return groups.length > 0 ? groups : [{ count: 3, reps: 10, isDropset: false }];
}

export function generateDescription(setGroups: SetGroup[]): string {
  return setGroups.map(group => {
    let repsStr: string;
    if (group.reps === 'max') {
      repsStr = 'max';
    } else if (group.isDropset && group.dropsetCount) {
      repsStr = Array(group.dropsetCount).fill(group.reps).join('-');
    } else {
      repsStr = group.reps.toString();
    }

    let part = `${group.count}x${repsStr}`;

    if (group.maxCount && group.maxCount > 0) {
      part += '+max'.repeat(group.maxCount);
    }

    if (group.note) part += ` (${group.note})`;
    return part;
  }).join(', ');
}

export function scrollToTop(): void {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}
