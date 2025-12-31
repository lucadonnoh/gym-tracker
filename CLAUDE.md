# Claude Instructions for Gym Tracker

## Core Principle: USABILITY FIRST

**This app is used during workouts. Functionality must NEVER be sacrificed for aesthetics.**

### Critical Rules

1. **Never hide or truncate information** - Exercise names, weights, reps, and stats must always be fully visible
2. **Never make the user guess** - All information needed to complete a workout must be immediately clear
3. **Layout consistency is secondary to information clarity** - If layout looks slightly inconsistent but all info is visible, that's acceptable. The reverse is NOT acceptable.
4. **Test on mobile** - This is primarily a mobile app used with sweaty hands during workouts

### When Making Design Decisions

Ask: "Will this make it harder for someone mid-workout to see what they need to do?"

If yes → Don't do it.

## Debugging Approach: TEST-DRIVEN DEBUGGING

**Always follow this approach when fixing bugs:**

1. **Write a test FIRST** that reproduces/detects the issue
2. **Run the test** to confirm it fails (proves the test catches the bug)
3. **Fix the issue** in the code
4. **Rerun the test** to confirm it passes
5. **Never test only for known symptoms** - use general detection methods (like CLS API for layout shifts) that catch unknown issues too

This prevents:
- Fixing symptoms without fixing root cause
- Tests that pass even when bug exists
- Regression of the same bug later
