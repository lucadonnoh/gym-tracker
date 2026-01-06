export interface WorkoutDay {
  id: number;
  name: string;
  display_name: string;
}

export interface Exercise {
  id: number;
  day_id: number;
  name: string;
  description: string | null;
  default_weight: number | null;
  order_index: number;
}

export interface Session {
  id: number;
  day_id: number;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_id: number;
  completed: boolean;
  notes: string | null;
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

export interface SessionWithDay extends Session {
  day_name: string;
  day_display_name: string;
}

export interface ExerciseWithSets extends Exercise {
  session_exercise_id?: number;
  completed?: boolean;
  sets?: SetLog[];
  lastSets?: SetLog[];
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

export interface User {
  id: number;
  username: string;
  created_at: string;
}
