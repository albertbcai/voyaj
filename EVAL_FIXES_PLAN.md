# Eval Test Results - Fix Plan

## Summary
All 8 scenarios failed (0% pass rate). Root cause: **Destination suggestions are not being saved to database**, which breaks the entire flow.

## Critical Issues

### 1. Database Constraint Error (BLOCKER)
**Error**: `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`

**Location**: `src/db/queries.js:198` in `createDestinationSuggestion`

**Problem**: The `ON CONFLICT (trip_id, member_id, destination)` clause fails because:
- The constraint might not exist in the database
- OR PostgreSQL needs a named constraint for ON CONFLICT to work

**Fix**: 
- Option A: Add explicit constraint name in schema: `CONSTRAINT unique_destination_suggestion UNIQUE(trip_id, member_id, destination)`
- Option B: Use `ON CONFLICT DO NOTHING` without specifying columns (less safe)
- Option C: Check if constraint exists, create migration if needed

**Files to fix**:
- `src/db/schema.sql` - Add named constraint
- `src/db/queries.js` - Update ON CONFLICT to use constraint name OR handle error gracefully
- Run migration to add constraint to existing database

### 2. Destination Suggestions Not Being Saved (BLOCKER)
**Symptom**: All scenarios show `destinationSuggestions: expected [Tokyo], got []`

**Root Cause**: Error in `normalizeDestination` or `createDestinationSuggestion` is being caught silently

**Location**: `src/agents/voting.js:206-213`

**Problem**: When `normalizeDestination` or `createDestinationSuggestion` fails, the error is caught and logged, but the destination isn't saved, and the code continues as if nothing happened.

**Fix**:
- Improve error handling to distinguish between "not a destination" (skip) vs "database error" (retry/fail)
- Add better logging to see actual database errors
- Ensure database constraint is created properly

### 3. Voting Not Starting (BLOCKER)
**Symptom**: `stage: expected "voting_destination", got "planning"`

**Root Cause**: Because destination suggestions aren't saved, `suggestionCount` is always 0, so voting never starts.

**Location**: `src/agents/voting.js:222-228` and `src/state/stateMachine.js:289-303`

**Fix**: Fix issue #1 and #2 first, then verify state transitions work correctly.

### 4. Votes Not Being Recognized in Planning Stage
**Symptom**: `voteCount: expected 1, got 0` when sending "1" in planning stage

**Location**: `src/agents/voting.js:71-82`

**Problem**: When stage is "planning" (not "voting_destination"), votes are being skipped. The voting agent checks `trip.stage === 'voting_destination'` but if we're still in planning, votes aren't processed.

**Fix**: This might be expected behavior - votes should only work when in voting stage. But the scenarios expect votes to work. Need to check if this is a test issue or code issue.

### 5. Date Voting Not Starting
**Symptom**: `stage: expected "voting_dates", got "planning"`

**Root Cause**: Similar to #3 - date availability might not be saved, or state transition logic isn't working.

**Location**: `src/state/stateMachine.js:305-320` and `src/agents/parser.js:207-296`

**Fix**: Verify date availability is being saved correctly, check state transition logic.

## Fix Priority

### Priority 1: Critical Blockers (Must Fix First)
1. **Fix database constraint error** - This is blocking all destination suggestions
2. **Fix destination suggestion saving** - Without this, nothing works
3. **Verify state transitions** - Ensure voting starts when all suggestions are collected

### Priority 2: Voting Issues
4. **Fix vote recognition** - Ensure votes work when in voting stage
5. **Fix date voting** - Ensure date voting starts when all dates submitted

### Priority 3: Edge Cases
6. **Fix large date overlap voting** - Special case for 20+ day overlaps
7. **Fix tie detection** - Ensure tie messages are sent correctly

## Implementation Steps

### Step 1: Fix Database Constraint
1. Update `src/db/schema.sql` to add named constraint
2. Create migration script to add constraint to existing databases
3. Update `src/db/queries.js` to use constraint name in ON CONFLICT
4. Test that destination suggestions can be saved

### Step 2: Fix Error Handling
1. Improve error handling in `handleDestinationSuggestion` to distinguish error types
2. Add better logging to see actual database errors
3. Ensure errors from `createDestinationSuggestion` are properly caught and handled

### Step 3: Verify State Transitions
1. Check that `checkPlanningTransitions` is being called after destination suggestions
2. Verify `suggestionCount` is calculated correctly
3. Test that voting stage starts when all members have suggested

### Step 4: Fix Voting
1. Ensure votes are only processed in voting stage (not planning)
2. Fix vote parsing to work correctly
3. Verify vote counting and majority detection

### Step 5: Fix Date Voting
1. Verify date availability is saved correctly
2. Check date overlap calculation
3. Ensure voting_dates stage starts when ready

## Test Plan
After fixes:
1. Run `npm run eval` again
2. Target: At least 6/8 scenarios passing
3. Focus on fixing the critical blockers first, then iterate

## Files to Modify

1. `src/db/schema.sql` - Add named constraint
2. `src/db/queries.js` - Fix ON CONFLICT clause
3. `src/agents/voting.js` - Improve error handling
4. `src/state/stateMachine.js` - Verify transition logic
5. `src/agents/parser.js` - Verify date handling
6. Migration script (new) - Add constraint to existing DBs

