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
  pr_count?: number;
  volume_prs?: number;
  set_prs?: number;
  weight_prs?: number;
  reps_prs?: number;
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
  maxCount?: number;
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

export interface MeasurementFieldConfig {
  key: keyof BodyMeasurement;
  label: string;
  unit: string;
  color: string;
  section: 'main' | 'upper' | 'core' | 'lower';
}

export const MEASUREMENT_FIELDS: MeasurementFieldConfig[] = [
  { key: 'weight', label: 'Weight', unit: 'kg', color: '#4CAF50', section: 'main' },
  { key: 'chest', label: 'Chest', unit: 'cm', color: '#9C27B0', section: 'upper' },
  { key: 'shoulders', label: 'Shoulders', unit: 'cm', color: '#E91E63', section: 'upper' },
  { key: 'neck', label: 'Neck', unit: 'cm', color: '#F44336', section: 'upper' },
  { key: 'left_arm', label: 'Left Arm', unit: 'cm', color: '#00BCD4', section: 'upper' },
  { key: 'right_arm', label: 'Right Arm', unit: 'cm', color: '#009688', section: 'upper' },
  { key: 'waist', label: 'Waist', unit: 'cm', color: '#FF9800', section: 'core' },
  { key: 'hips', label: 'Hips', unit: 'cm', color: '#795548', section: 'core' },
  { key: 'left_thigh', label: 'Left Thigh', unit: 'cm', color: '#3F51B5', section: 'lower' },
  { key: 'right_thigh', label: 'Right Thigh', unit: 'cm', color: '#673AB7', section: 'lower' },
  { key: 'left_calf', label: 'Left Calf', unit: 'cm', color: '#607D8B', section: 'lower' },
  { key: 'right_calf', label: 'Right Calf', unit: 'cm', color: '#455A64', section: 'lower' },
];

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface FriendRequest {
  id: number;
  from_user_id: number;
  to_user_id: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  from_username: string;
  to_username: string;
}

export interface Friend {
  user_id: number;
  username: string;
  since: string;
}
