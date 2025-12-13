import * as db from '../../../src/db/queries.js';
import { isReplayMode } from '../../../src/utils/snapshotManager.js';

/**
 * Ensure we're in snapshot mode (replay mode)
 * Throws error if not, to prevent accidental API costs
 */
export function ensureSnapshotMode() {
  if (!isReplayMode()) {
    throw new Error(
      'Agent tests must run in snapshot mode. Set USE_SNAPSHOTS=true or use default mode.\n' +
      'Run "npm run eval:record" first to record snapshots if needed.'
    );
  }
}

/**
 * Setup test database with a trip
 * @param {Object} options - Trip setup options
 * @returns {Promise<{tripId: number, trip: Object}>}
 */
export async function setupTestDB(options = {}) {
  const { members = [], stage = 'created' } = options;
  
  const trip = await db.createTrip({
    inviteCode: `test-agent-${Date.now()}`,
    groupChatId: `test-group-${Date.now()}`,
    stage,
  });
  
  // Create members if provided
  const createdMembers = [];
  for (const member of members) {
    const created = await db.createMember(trip.id, member.phone, member.name);
    createdMembers.push(created);
  }
  
  return {
    tripId: trip.id,
    trip,
    members: createdMembers,
  };
}

/**
 * Cleanup test database
 * @param {number} tripId - Trip ID to clean up
 */
export async function cleanupTestDB(tripId) {
  // Delete all related data
  await db.pool.query('DELETE FROM messages WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM destination_suggestions WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM votes WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM date_availability WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM flights WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM members WHERE trip_id = $1', [tripId]);
  await db.pool.query('DELETE FROM trips WHERE id = $1', [tripId]);
}

/**
 * Create a mock context object for agent tests
 * @param {Object} trip - Trip object
 * @param {Array} members - Array of member objects
 * @param {Object} member - Current member (optional)
 * @returns {Object} Context object
 */
export function createMockContext(trip, members = [], member = null) {
  return {
    trip,
    member,
    allMembers: members,
    dateAvailability: [],
    destinationSuggestions: [],
    votes: [],
  };
}

/**
 * Create a mock message object
 * @param {string} from - Phone number
 * @param {string} body - Message body
 * @returns {Object} Message object
 */
export function createMockMessage(from, body) {
  return {
    from,
    body,
    groupChatId: `test-group-${Date.now()}`,
  };
}

