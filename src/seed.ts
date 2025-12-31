import { db, initializeDatabase } from './database.js';

initializeDatabase();

// Clear existing data
db.exec('DELETE FROM set_logs');
db.exec('DELETE FROM session_exercises');
db.exec('DELETE FROM sessions');
db.exec('DELETE FROM exercises');
db.exec('DELETE FROM workout_days');

// Insert workout days
const insertDay = db.prepare('INSERT INTO workout_days (name, display_name) VALUES (?, ?)');
insertDay.run('chest_triceps', 'Chest & Triceps');
insertDay.run('legs', 'Legs');
insertDay.run('back', 'Back');
insertDay.run('shoulders', 'Shoulders');
insertDay.run('arms', 'Arms');

// Get day IDs
const getDayId = (name: string): number => {
  const row = db.prepare('SELECT id FROM workout_days WHERE name = ?').get(name) as { id: number };
  return row.id;
};

const chestTricepsId = getDayId('chest_triceps');
const legsId = getDayId('legs');
const backId = getDayId('back');
const shouldersId = getDayId('shoulders');
const armsId = getDayId('arms');

// Insert exercises
const insertExercise = db.prepare(
  'INSERT INTO exercises (day_id, name, description, default_weight, order_index) VALUES (?, ?, ?, ?, ?)'
);

// Chest & Triceps
insertExercise.run(chestTricepsId, 'Pec Deck Machine', '1x20, 1x15', 17.5, 0);
insertExercise.run(chestTricepsId, 'Smith Machine Bench Press 45°', '2x6, 1x10-10-10, 1x10 (3s eccentric)', 45, 1);
insertExercise.run(chestTricepsId, 'Dumbbell Flat Bench Press', '2x8, 1x12', 22.5, 2);
insertExercise.run(chestTricepsId, 'High Cable Flyes', '3x12', 7.5, 3);
insertExercise.run(chestTricepsId, 'Chest Press Machine', '3x10+5 (15s rest)', 45, 4);
insertExercise.run(chestTricepsId, 'Dips', '2x max', null, 5);
insertExercise.run(chestTricepsId, 'Reverse Grip Pushdown', '4x10', 12.5, 6);

// Legs
insertExercise.run(legsId, 'Leg Extensions', '3x25, 1x15, 1x10', 30, 0);
insertExercise.run(legsId, 'Leg Press', '4x12', 100, 1);
insertExercise.run(legsId, 'Leg Curl', '2x20, 1x15, 1x10', 32.5, 2);

// Back
insertExercise.run(backId, 'Cable Pulldown', '2x15, 1x10', 15, 0);
insertExercise.run(backId, 'Dumbbell Row', '4x8', 25, 1);
insertExercise.run(backId, 'Pull-ups', '3x max', null, 2);
insertExercise.run(backId, 'Supine Pulley Row', '3x10 (2s iso), 1x10', 45, 3);
insertExercise.run(backId, 'Lat Pulldown (Triangle)', '3x8+4 (15s rest)', 45, 4);
insertExercise.run(backId, 'Low Cable Row', '3x15', 15, 5);
insertExercise.run(backId, 'High Cable Curl', '4x12', 7.5, 6);

// Shoulders
insertExercise.run(shouldersId, 'Shoulder Press Machine', '4x8', 35, 0);
insertExercise.run(shouldersId, 'Low Cable Front Raise', '2x15', 7.5, 1);
insertExercise.run(shouldersId, 'Dumbbell Lateral Raise', '3x10-10-10', 12.5, 2);
insertExercise.run(shouldersId, 'Dumbbell Overhead Press', '3x12', 15, 3);
insertExercise.run(shouldersId, 'Reverse Fly', '3x10+max (15s rest)', 12.5, 4);
insertExercise.run(shouldersId, 'Cable Lateral Raise', '3x20', 5, 5);

// Arms
insertExercise.run(armsId, 'Tricep Pushdown', '2x10, 1x20+max+max (10s rest)', 20, 0);
insertExercise.run(armsId, 'Low Cable Curl', '2x10, 1x20+max+max (10s rest)', 20, 1);
insertExercise.run(armsId, 'Close Grip Bench Press', '4x8', 40, 2);
insertExercise.run(armsId, 'Dumbbell Curl', '4x8', 17.5, 3);
insertExercise.run(armsId, 'Single Arm Cable French Press', '3x10', 7.5, 4);
insertExercise.run(armsId, 'Incline Bench Curl (45°)', '3x10', 10, 5);

// Get exercise IDs
const getExerciseId = (name: string): number => {
  const row = db.prepare('SELECT id FROM exercises WHERE name = ?').get(name) as { id: number };
  return row.id;
};

// Create "last session" data for each workout day with actual weights
const insertSession = db.prepare('INSERT INTO sessions (day_id, started_at, ended_at) VALUES (?, ?, ?)');
const insertSessionExercise = db.prepare('INSERT INTO session_exercises (session_id, exercise_id, completed) VALUES (?, ?, 1)');
const insertSetLog = db.prepare('INSERT INTO set_logs (session_exercise_id, set_number, weight, reps, is_dropset) VALUES (?, ?, ?, ?, ?)');

// Helper to log sets with explicit set numbers
const logSets = (sessionExerciseId: number, sets: { setNumber: number; weight: number; reps: number; isDropset?: boolean }[]) => {
  sets.forEach((set) => {
    insertSetLog.run(sessionExerciseId, set.setNumber, set.weight, set.reps, set.isDropset ? 1 : 0);
  });
};

// Last week's date
const lastWeek = new Date();
lastWeek.setDate(lastWeek.getDate() - 7);
const lastWeekStr = lastWeek.toISOString();
const lastWeekEndStr = new Date(lastWeek.getTime() + 3600000).toISOString();

// --- CHEST & TRICEPS SESSION ---
const chestSession = insertSession.run(chestTricepsId, lastWeekStr, lastWeekEndStr);
const chestSessionId = Number(chestSession.lastInsertRowid);

// 1. Pec Deck: 1x20 1x15 (17.5kg)
let seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Pec Deck Machine'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 17.5, reps: 20 },
  { setNumber: 2, weight: 17.5, reps: 15 }
]);

// 2. Smith Machine Bench: 2x6 1x10-10-10 1x10 (45kg, 40-35-25kg, 25kg)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Smith Machine Bench Press 45°'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 45, reps: 6 },
  { setNumber: 2, weight: 45, reps: 6 },
  { setNumber: 3, weight: 40, reps: 10, isDropset: true },      // dropset part 1
  { setNumber: 3.1, weight: 35, reps: 10, isDropset: true },    // dropset part 2
  { setNumber: 3.2, weight: 25, reps: 10, isDropset: true },    // dropset part 3
  { setNumber: 4, weight: 25, reps: 10 }                        // eccentric set
]);

// 3. Dumbbell Bench: 2x8 1x12 (22.5kg)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Dumbbell Flat Bench Press'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 22.5, reps: 8 },
  { setNumber: 2, weight: 22.5, reps: 8 },
  { setNumber: 3, weight: 22.5, reps: 12 }
]);

// 4. High Cable Flyes: 3x12 (7.5kg)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('High Cable Flyes'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 7.5, reps: 12 },
  { setNumber: 2, weight: 7.5, reps: 12 },
  { setNumber: 3, weight: 7.5, reps: 12 }
]);

// 5. Chest Press Machine: 3x10+5 (45kg)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Chest Press Machine'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 45, reps: 15 },
  { setNumber: 2, weight: 45, reps: 15 },
  { setNumber: 3, weight: 45, reps: 15 }
]);

// 6. Dips: 2xmax (12, 10)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Dips'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 0, reps: 12 },
  { setNumber: 2, weight: 0, reps: 10 }
]);

// 7. Reverse Grip Pushdown: 4x10 (12.5kg)
seRes = insertSessionExercise.run(chestSessionId, getExerciseId('Reverse Grip Pushdown'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 12.5, reps: 10 },
  { setNumber: 2, weight: 12.5, reps: 10 },
  { setNumber: 3, weight: 12.5, reps: 10 },
  { setNumber: 4, weight: 12.5, reps: 10 }
]);

// --- LEGS SESSION ---
const legsSession = insertSession.run(legsId, lastWeekStr, lastWeekEndStr);
const legsSessionId = Number(legsSession.lastInsertRowid);

// 1. Leg Extensions: 3x25 1x15 1x10 (30kg, 40kg, 45kg)
seRes = insertSessionExercise.run(legsSessionId, getExerciseId('Leg Extensions'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 30, reps: 25 },
  { setNumber: 2, weight: 30, reps: 25 },
  { setNumber: 3, weight: 30, reps: 25 },
  { setNumber: 4, weight: 40, reps: 15 },
  { setNumber: 5, weight: 45, reps: 10 }
]);

// 2. Leg Press: 4x12 (100kg)
seRes = insertSessionExercise.run(legsSessionId, getExerciseId('Leg Press'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 100, reps: 12 },
  { setNumber: 2, weight: 100, reps: 12 },
  { setNumber: 3, weight: 100, reps: 12 },
  { setNumber: 4, weight: 100, reps: 12 }
]);

// 3. Leg Curl: 2x20 1x15 1x10 (32.5kg, 35kg, 35kg)
seRes = insertSessionExercise.run(legsSessionId, getExerciseId('Leg Curl'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 32.5, reps: 20 },
  { setNumber: 2, weight: 32.5, reps: 20 },
  { setNumber: 3, weight: 35, reps: 15 },
  { setNumber: 4, weight: 35, reps: 10 }
]);

// --- BACK SESSION ---
const backSession = insertSession.run(backId, lastWeekStr, lastWeekEndStr);
const backSessionId = Number(backSession.lastInsertRowid);

// 1. Cable Pulldown: 2x15 1x10 (15kg, 20kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Cable Pulldown'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 15, reps: 15 },
  { setNumber: 2, weight: 15, reps: 15 },
  { setNumber: 3, weight: 20, reps: 10 }
]);

// 2. Dumbbell Row: 4x8 (25kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Dumbbell Row'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 25, reps: 8 },
  { setNumber: 2, weight: 25, reps: 8 },
  { setNumber: 3, weight: 25, reps: 8 },
  { setNumber: 4, weight: 25, reps: 8 }
]);

// 3. Pull-ups: 3xmax (11, 9, 6)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Pull-ups'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 0, reps: 11 },
  { setNumber: 2, weight: 0, reps: 9 },
  { setNumber: 3, weight: 0, reps: 6 }
]);

// 4. Supine Pulley Row: 3x10 1x10 (45kg, 50kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Supine Pulley Row'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 45, reps: 10 },
  { setNumber: 2, weight: 45, reps: 10 },
  { setNumber: 3, weight: 45, reps: 10 },
  { setNumber: 4, weight: 50, reps: 10 }
]);

// 5. Lat Pulldown Triangle: 3x8+4 (45kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Lat Pulldown (Triangle)'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 45, reps: 12 },
  { setNumber: 2, weight: 45, reps: 12 },
  { setNumber: 3, weight: 45, reps: 12 }
]);

// 6. Low Cable Row: 3x15 (15kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('Low Cable Row'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 15, reps: 15 },
  { setNumber: 2, weight: 15, reps: 15 },
  { setNumber: 3, weight: 15, reps: 15 }
]);

// 7. High Cable Curl: 4x12 (7.5kg)
seRes = insertSessionExercise.run(backSessionId, getExerciseId('High Cable Curl'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 7.5, reps: 12 },
  { setNumber: 2, weight: 7.5, reps: 12 },
  { setNumber: 3, weight: 7.5, reps: 12 },
  { setNumber: 4, weight: 7.5, reps: 12 }
]);

// --- SHOULDERS SESSION ---
const shouldersSession = insertSession.run(shouldersId, lastWeekStr, lastWeekEndStr);
const shouldersSessionId = Number(shouldersSession.lastInsertRowid);

// 1. Shoulder Press Machine: 4x8 (35kg)
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Shoulder Press Machine'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 35, reps: 8 },
  { setNumber: 2, weight: 35, reps: 8 },
  { setNumber: 3, weight: 35, reps: 8 },
  { setNumber: 4, weight: 35, reps: 8 }
]);

// 2. Low Cable Front Raise: 2x15 (7.5kg)
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Low Cable Front Raise'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 7.5, reps: 15 },
  { setNumber: 2, weight: 7.5, reps: 15 }
]);

// 3. Dumbbell Lateral Raise: 3x10-10-10 (12.5kg-10kg-7kg) - 3 dropsets
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Dumbbell Lateral Raise'));
logSets(Number(seRes.lastInsertRowid), [
  // Dropset 1
  { setNumber: 1, weight: 12.5, reps: 10, isDropset: true },
  { setNumber: 1.1, weight: 10, reps: 10, isDropset: true },
  { setNumber: 1.2, weight: 7, reps: 10, isDropset: true },
  // Dropset 2
  { setNumber: 2, weight: 12.5, reps: 10, isDropset: true },
  { setNumber: 2.1, weight: 10, reps: 10, isDropset: true },
  { setNumber: 2.2, weight: 7, reps: 10, isDropset: true },
  // Dropset 3
  { setNumber: 3, weight: 12.5, reps: 10, isDropset: true },
  { setNumber: 3.1, weight: 10, reps: 10, isDropset: true },
  { setNumber: 3.2, weight: 7, reps: 10, isDropset: true }
]);

// 4. Dumbbell Overhead Press: 3x12 (15kg)
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Dumbbell Overhead Press'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 15, reps: 12 },
  { setNumber: 2, weight: 15, reps: 12 },
  { setNumber: 3, weight: 15, reps: 12 }
]);

// 5. Reverse Fly: 3x10+max (12.5kg)
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Reverse Fly'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 12.5, reps: 15 },
  { setNumber: 2, weight: 12.5, reps: 15 },
  { setNumber: 3, weight: 12.5, reps: 15 }
]);

// 6. Cable Lateral Raise: 3x20 (5kg)
seRes = insertSessionExercise.run(shouldersSessionId, getExerciseId('Cable Lateral Raise'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 5, reps: 20 },
  { setNumber: 2, weight: 5, reps: 20 },
  { setNumber: 3, weight: 5, reps: 20 }
]);

// --- ARMS SESSION ---
const armsSession = insertSession.run(armsId, lastWeekStr, lastWeekEndStr);
const armsSessionId = Number(armsSession.lastInsertRowid);

// 1. Tricep Pushdown: 2x10 1x20+max+max (20kg, 12.5kg - 11, 5)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Tricep Pushdown'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 20, reps: 10 },
  { setNumber: 2, weight: 20, reps: 10 },
  { setNumber: 3, weight: 12.5, reps: 20 },
  { setNumber: 4, weight: 12.5, reps: 11 },
  { setNumber: 5, weight: 12.5, reps: 5 }
]);

// 2. Low Cable Curl: 2x10 1x20+max+max (20kg, 12.5kg - 6, 4)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Low Cable Curl'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 20, reps: 10 },
  { setNumber: 2, weight: 20, reps: 10 },
  { setNumber: 3, weight: 12.5, reps: 20 },
  { setNumber: 4, weight: 12.5, reps: 6 },
  { setNumber: 5, weight: 12.5, reps: 4 }
]);

// 3. Close Grip Bench Press: 4x8 (40kg)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Close Grip Bench Press'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 40, reps: 8 },
  { setNumber: 2, weight: 40, reps: 8 },
  { setNumber: 3, weight: 40, reps: 8 },
  { setNumber: 4, weight: 40, reps: 8 }
]);

// 4. Dumbbell Curl: 4x8 (17.5kg)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Dumbbell Curl'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 17.5, reps: 8 },
  { setNumber: 2, weight: 17.5, reps: 8 },
  { setNumber: 3, weight: 17.5, reps: 8 },
  { setNumber: 4, weight: 17.5, reps: 8 }
]);

// 5. Single Arm Cable French Press: 3x10 (7.5kg)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Single Arm Cable French Press'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 7.5, reps: 10 },
  { setNumber: 2, weight: 7.5, reps: 10 },
  { setNumber: 3, weight: 7.5, reps: 10 }
]);

// 6. Incline Bench Curl: 3x10 (10kg)
seRes = insertSessionExercise.run(armsSessionId, getExerciseId('Incline Bench Curl (45°)'));
logSets(Number(seRes.lastInsertRowid), [
  { setNumber: 1, weight: 10, reps: 10 },
  { setNumber: 2, weight: 10, reps: 10 },
  { setNumber: 3, weight: 10, reps: 10 }
]);

console.log('Database seeded successfully with last session data!');
console.log('Workout days:', db.prepare('SELECT COUNT(*) as count FROM workout_days').get());
console.log('Exercises:', db.prepare('SELECT COUNT(*) as count FROM exercises').get());
console.log('Sessions:', db.prepare('SELECT COUNT(*) as count FROM sessions').get());
console.log('Set logs:', db.prepare('SELECT COUNT(*) as count FROM set_logs').get());
