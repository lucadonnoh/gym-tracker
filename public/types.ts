// Shared TypeScript interfaces

export interface WorkoutDay {
  id: number;
  name: string;
  display_name: string;
  last_session_date: string | null;
}

export interface Exercise {
  id: number;
  day_id: number;
  name: string;
  description: string | null;
  default_weight: number | null;
  order_index: number;
  day_display_name?: string;
}

export interface SetLog {
  id: number;
  session_exercise_id: number;
  set_number: number;
  weight: number | null;
  reps: number | null;
  is_dropset: boolean;
  notes: string | null;
}

export interface ExerciseWithSets extends Exercise {
  session_exercise_id?: number;
  completed?: boolean;
  sets?: SetLog[];
  lastSets?: SetLog[];
  lastVolume?: number | null;
}

export interface Session {
  id: number;
  day_id: number;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  day_name?: string;
  day_display_name?: string;
}

export interface ProgressData {
  date: string;
  maxWeight: number;
  totalReps: number;
}

export interface ParsedSet {
  setNumber: number;
  reps: number | string;
  isDropset: boolean;
  dropsetParts?: number;
}

export interface SetGroup {
  count: number;
  reps: number | 'max';
  isDropset: boolean;
  dropsetCount?: number;
  note?: string;
}

export interface ExerciseStats {
  exerciseId: number;
  volume: number;
  maxWeight: number;
  maxSetVolume: number;
  maxReps: number;
  prs: {
    volume: boolean;
    setVolume: boolean;
    weight: boolean;
    reps: boolean;
  };
}

export interface SummaryStats {
  totalWorkouts: number;
  totalHours: number;
  weeklyGoal: number;
  currentWeekWorkouts: { date: string; dayOfWeek: number }[];
  streak: { current: number; best: number };
}

export interface BodyMeasurement {
  id: number;
  measured_at: string;
  weight: number | null;
  chest: number | null;
  waist: number | null;
  hips: number | null;
  left_arm: number | null;
  right_arm: number | null;
  left_thigh: number | null;
  right_thigh: number | null;
  left_calf: number | null;
  right_calf: number | null;
  shoulders: number | null;
  neck: number | null;
  notes: string | null;
}

// Single source of truth for measurement fields
// Add/remove fields here and they update everywhere (form, display, charts)
export interface MeasurementFieldConfig {
  key: keyof BodyMeasurement;
  label: string;
  unit: string;
  color: string;
  section: 'main' | 'upper' | 'core' | 'lower';
}

export const MEASUREMENT_FIELDS: MeasurementFieldConfig[] = [
  // Main
  { key: 'weight', label: 'Weight', unit: 'kg', color: '#4CAF50', section: 'main' },
  // Upper body
  { key: 'chest', label: 'Chest', unit: 'cm', color: '#9C27B0', section: 'upper' },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm', color: '#E91E63', section: 'upper' },
  { key: 'neck', label: 'Neck', unit: 'cm', color: '#F44336', section: 'upper' },
  { key: 'left_arm', label: 'Left Arm', unit: 'cm', color: '#00BCD4', section: 'upper' },
  { key: 'right_arm', label: 'Right Arm', unit: 'cm', color: '#009688', section: 'upper' },
  // Core
  { key: 'waist', label: 'Waist', unit: 'cm', color: '#FF9800', section: 'core' },
  { key: 'hips', label: 'Hips', unit: 'cm', color: '#795548', section: 'core' },
  // Lower body
  { key: 'left_thigh', label: 'Left Thigh', unit: 'cm', color: '#3F51B5', section: 'lower' },
  { key: 'right_thigh', label: 'Right Thigh', unit: 'cm', color: '#673AB7', section: 'lower' },
  { key: 'left_calf', label: 'Left Calf', unit: 'cm', color: '#607D8B', section: 'lower' },
  { key: 'right_calf', label: 'Right Calf', unit: 'cm', color: '#455A64', section: 'lower' },
];

export interface User {
  id: number;
  username: string;
  created_at: string;
}

// DOM element refs that we cache
export interface DOMRefs {
  // Home screen
  dayButtons: HTMLElement | null;
  activeSessionBanner: HTMLElement | null;
  statsContainer: HTMLElement | null;

  // Session screen
  sessionDayName: HTMLElement | null;
  sessionTimer: HTMLElement | null;
  exerciseList: HTMLElement | null;

  // History screen
  sessionHistory: HTMLElement | null;

  // Session detail screen
  detailSessionTitle: HTMLElement | null;
  sessionDetailContent: HTMLElement | null;

  // Progress screen
  exerciseSelect: HTMLSelectElement | null;
  chartsContainer: HTMLElement | null;

  // Manage screen
  manageDaySelect: HTMLSelectElement | null;
  manageExerciseList: HTMLElement | null;
  addExerciseBtn: HTMLElement | null;

  // Modals
  exerciseModal: HTMLElement | null;
  restTimerModal: HTMLElement | null;
  editSetModal: HTMLElement | null;
}
