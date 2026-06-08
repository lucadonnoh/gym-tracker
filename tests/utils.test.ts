import { describe, it, expect } from 'vitest';
import { parseSetScheme, parseDescriptionToGroups, generateDescription } from '../src/frontend/lib/utils';

describe('parseSetScheme', () => {
  it('parses a plain scheme (3x10) as N sets of the base reps', () => {
    const sets = parseSetScheme('3x10');
    expect(sets.map(s => s.reps)).toEqual([10, 10, 10]);
  });

  it('sums a numeric rest-pause add-on into each set (3x10+5 => 15 reps)', () => {
    // "3x10+5 (15s rest)" means: 10 reps, short rest, then 5 more -> 15 reps per set
    const sets = parseSetScheme('3x10+5 (15s rest)');
    expect(sets).toHaveLength(3);
    expect(sets.map(s => s.reps)).toEqual([15, 15, 15]);
    expect(sets.every(s => !s.isDropset)).toBe(true);
  });

  it('sums another numeric add-on (3x8+4 => 12 reps)', () => {
    const sets = parseSetScheme('3x8+4 (15s rest)');
    expect(sets.map(s => s.reps)).toEqual([12, 12, 12]);
  });

  it('supports multiple numeric add-ons (2x10+5+3 => 18 reps)', () => {
    const sets = parseSetScheme('2x10+5+3');
    expect(sets.map(s => s.reps)).toEqual([18, 18]);
  });

  it('keeps "+max" add-ons as separate max sets (3x10+max)', () => {
    const sets = parseSetScheme('3x10+max (15s rest)');
    expect(sets.map(s => s.reps)).toEqual([10, 10, 10, 'max']);
  });

  it('handles a base set followed by multiple max add-ons (1x20+max+max)', () => {
    const sets = parseSetScheme('1x20+max+max (10s rest)');
    expect(sets.map(s => s.reps)).toEqual([20, 'max', 'max']);
  });

  it('combines comma-separated parts (2x10, 1x20+max+max)', () => {
    const sets = parseSetScheme('2x10, 1x20+max+max (10s rest)');
    expect(sets.map(s => s.reps)).toEqual([10, 10, 20, 'max', 'max']);
  });
});

describe('parseDescriptionToGroups / generateDescription round-trip', () => {
  it('captures a numeric rest-pause add-on into bonusReps', () => {
    const groups = parseDescriptionToGroups('3x10+5 (15s rest)');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 3, reps: 10, bonusReps: 5, note: '15s rest' });
  });

  it('round-trips a rest-pause scheme without losing the add-on', () => {
    // Editing this exercise in the builder must not silently drop "+5".
    const groups = parseDescriptionToGroups('3x10+5 (15s rest)');
    expect(generateDescription(groups)).toBe('3x10+5 (15s rest)');
  });

  it('round-trips a "+max" rest-pause scheme', () => {
    const groups = parseDescriptionToGroups('3x10+max (15s rest)');
    expect(generateDescription(groups)).toBe('3x10+max (15s rest)');
  });

  it('round-trips a base set with multiple max add-ons', () => {
    const groups = parseDescriptionToGroups('2x10, 1x20+max+max (10s rest)');
    expect(generateDescription(groups)).toBe('2x10, 1x20+max+max (10s rest)');
  });

  it('round-trips a plain scheme unchanged', () => {
    const groups = parseDescriptionToGroups('4x8');
    expect(generateDescription(groups)).toBe('4x8');
  });
});
