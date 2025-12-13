import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.database.url,
});

// Trips
export async function getTrip(tripId) {
  const result = await pool.query('SELECT * FROM trips WHERE id = $1', [tripId]);
  return result.rows[0] || null;
}

export async function getTripByInviteCode(inviteCode) {
  const result = await pool.query('SELECT * FROM trips WHERE invite_code = $1', [inviteCode]);
  return result.rows[0] || null;
}

export async function getTripByGroupChatId(groupChatId) {
  const result = await pool.query('SELECT * FROM trips WHERE group_chat_id = $1', [groupChatId]);
  return result.rows[0] || null;
}

export async function createTrip(data) {
  const { inviteCode, groupChatId, destination, startDate, endDate, stage } = data;
  const result = await pool.query(
    `INSERT INTO trips (invite_code, group_chat_id, destination, start_date, end_date, stage)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [inviteCode, groupChatId, destination, startDate, endDate, stage || 'created']
  );
  return result.rows[0];
}

export async function updateTrip(tripId, updates) {
  const fields = Object.keys(updates);
  const values = Object.values(updates);
  const setClause = fields.map((field, i) => `${field} = $${i + 2}`).join(', ');
  
  const result = await pool.query(
    `UPDATE trips SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    [tripId, ...values]
  );
  return result.rows[0];
}

// Members
export async function getMemberByPhone(phoneNumber) {
  const result = await pool.query(
    'SELECT * FROM members WHERE phone_number = $1 ORDER BY joined_at DESC LIMIT 1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

export async function getMemberByPhoneAndTrip(tripId, phoneNumber) {
  const result = await pool.query(
    'SELECT * FROM members WHERE trip_id = $1 AND phone_number = $2',
    [tripId, phoneNumber]
  );
  return result.rows[0] || null;
}

export async function getMembers(tripId) {
  const result = await pool.query(
    'SELECT * FROM members WHERE trip_id = $1 ORDER BY joined_at ASC',
    [tripId]
  );
  return result.rows;
}

export async function getMemberCount(tripId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM members WHERE trip_id = $1',
    [tripId]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function createMember(tripId, phoneNumber, name) {
  const result = await pool.query(
    `INSERT INTO members (trip_id, phone_number, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone_number) DO UPDATE SET trip_id = $1, name = $3
     RETURNING *`,
    [tripId, phoneNumber, name]
  );
  return result.rows[0];
}

// Votes
export async function createVote(tripId, pollType, memberId, choice) {
  const result = await pool.query(
    `INSERT INTO votes (trip_id, poll_type, member_id, choice)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (trip_id, poll_type, member_id) DO UPDATE SET choice = $4, voted_at = NOW()
     RETURNING *`,
    [tripId, pollType, memberId, choice]
  );
  return result.rows[0];
}

export async function getVotes(tripId, pollType = null) {
  let query = 'SELECT * FROM votes WHERE trip_id = $1';
  const params = [tripId];
  
  if (pollType) {
    query += ' AND poll_type = $2';
    params.push(pollType);
  }
  
  query += ' ORDER BY voted_at ASC';
  
  const result = await pool.query(query, params);
  return result.rows;
}

export async function getVoteCount(tripId, pollType) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM votes WHERE trip_id = $1 AND poll_type = $2',
    [tripId, pollType]
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getVoteResults(tripId, pollType) {
  const result = await pool.query(
    `SELECT choice, COUNT(*) as count
     FROM votes
     WHERE trip_id = $1 AND poll_type = $2
     GROUP BY choice
     ORDER BY count DESC`,
    [tripId, pollType]
  );
  return result.rows;
}

// Flights
export async function createFlight(tripId, memberId, data) {
  const { airline, flightNumber, departureTime, arrivalTime } = data;
  const result = await pool.query(
    `INSERT INTO flights (trip_id, member_id, airline, flight_number, departure_time, arrival_time)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (trip_id, member_id) DO UPDATE SET
       airline = $3, flight_number = $4, departure_time = $5, arrival_time = $6
     RETURNING *`,
    [tripId, memberId, airline, flightNumber, departureTime, arrivalTime]
  );
  return result.rows[0];
}

export async function getFlights(tripId) {
  const result = await pool.query(
    `SELECT f.*, m.name as member_name
     FROM flights f
     JOIN members m ON f.member_id = m.id
     WHERE f.trip_id = $1
     ORDER BY f.created_at ASC`,
    [tripId]
  );
  return result.rows;
}

export async function getFlightCount(tripId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM flights WHERE trip_id = $1',
    [tripId]
  );
  return parseInt(result.rows[0].count, 10);
}

// Messages
export async function createMessage(tripId, fromPhone, body, groupChatId, source = 'sms') {
  const result = await pool.query(
    `INSERT INTO messages (trip_id, from_phone, body, group_chat_id, source)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [tripId, fromPhone, body, groupChatId, source]
  );
  return result.rows[0];
}

export async function getRecentMessages(tripId, limit = 10) {
  const result = await pool.query(
    'SELECT * FROM messages WHERE trip_id = $1 ORDER BY received_at DESC LIMIT $2',
    [tripId, limit]
  );
  return result.rows.reverse(); // Return in chronological order
}

// Destination suggestions
export async function createDestinationSuggestion(tripId, memberId, destination) {
  const result = await pool.query(
    `INSERT INTO destination_suggestions (trip_id, member_id, destination)
     VALUES ($1, $2, $3)
     ON CONFLICT ON CONSTRAINT unique_destination_suggestion DO NOTHING
     RETURNING *`,
    [tripId, memberId, destination]
  );
  return result.rows[0];
}

export async function getDestinationSuggestions(tripId) {
  const result = await pool.query(
    `SELECT ds.*, m.name as member_name
     FROM destination_suggestions ds
     JOIN members m ON ds.member_id = m.id
     WHERE ds.trip_id = $1
     ORDER BY ds.suggested_at ASC`,
    [tripId]
  );
  return result.rows;
}

export async function getDestinationSuggestionCount(tripId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM destination_suggestions WHERE trip_id = $1',
    [tripId]
  );
  return parseInt(result.rows[0].count, 10);
}

// Date availability
export async function createDateAvailability(tripId, memberId, data) {
  const { startDate, endDate, isFlexible } = data;
  const result = await pool.query(
    `INSERT INTO date_availability (trip_id, member_id, start_date, end_date, is_flexible)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (trip_id, member_id) DO UPDATE SET
       start_date = $3, end_date = $4, is_flexible = $5, submitted_at = NOW()
     RETURNING *`,
    [tripId, memberId, startDate, endDate, isFlexible || false]
  );
  return result.rows[0];
}

export async function getDateAvailability(tripId) {
  const result = await pool.query(
    `SELECT da.*, m.name as member_name
     FROM date_availability da
     JOIN members m ON da.member_id = m.id
     WHERE da.trip_id = $1
     ORDER BY da.submitted_at ASC`,
    [tripId]
  );
  return result.rows;
}

export async function getDateAvailabilityCount(tripId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM date_availability WHERE trip_id = $1',
    [tripId]
  );
  return parseInt(result.rows[0].count, 10);
}

// Trip notes/ideas (unstructured ideas for later reference)
export async function addTripNote(tripId, note) {
  const trip = await getTrip(tripId);
  const currentNotes = trip.notes || [];
  const newNote = {
    text: note,
    addedAt: new Date().toISOString(),
  };
  const updatedNotes = [...currentNotes, newNote];
  await updateTrip(tripId, { notes: JSON.stringify(updatedNotes) });
  return newNote;
}

export async function getTripNotes(tripId) {
  const trip = await getTrip(tripId);
  return trip.notes || [];
}

// Error logs
export async function logError(tripId, error, context = {}) {
  await pool.query(
    `INSERT INTO error_logs (trip_id, error_message, stack_trace, context)
     VALUES ($1, $2, $3, $4)`,
    [tripId, error.message, error.stack, JSON.stringify(context)]
  );
}

// Helper: Get active trips for nudge scheduler
export async function getActiveTrips() {
  try {
    // Try query with last_nudge_at column
    const result = await pool.query(
      `SELECT * FROM trips
       WHERE stage IN ('collecting_destinations', 'voting_destination', 'collecting_dates', 'voting_dates', 'tracking_flights')
       AND (last_nudge_at IS NULL OR last_nudge_at < NOW() - INTERVAL '6 hours')
       ORDER BY updated_at DESC`,
      []
    );
    return result.rows;
  } catch (error) {
    // If column doesn't exist, fall back to query without it
    if (error.code === '42703' && error.message.includes('last_nudge_at')) {
      console.warn('   ⚠️  Column last_nudge_at does not exist, using fallback query');
      const result = await pool.query(
        `SELECT * FROM trips
         WHERE stage IN ('collecting_destinations', 'voting_destination', 'collecting_dates', 'voting_dates', 'tracking_flights')
         ORDER BY updated_at DESC`,
        []
      );
      return result.rows;
    }
    // Re-throw other errors
    throw error;
  }
}

// Preference tracking helpers
export async function addTripPreference(tripId, memberId, preferenceType, preferenceText, originalMessage) {
  try {
    // Get current trip and notes
    const trip = await getTrip(tripId);
    const member = await pool.query('SELECT name FROM members WHERE id = $1', [memberId]);
    const memberName = member.rows[0]?.name || 'Unknown';
    
    // Parse existing notes (handle both array and object formats)
    let notes = {};
    if (trip.notes) {
      try {
        notes = typeof trip.notes === 'string' ? JSON.parse(trip.notes) : trip.notes;
      } catch (e) {
        // If notes is not valid JSON, start fresh
        notes = {};
      }
    }
    
    // Initialize preferences structure
    if (!notes.preferences) {
      notes.preferences = {};
    }
    if (!notes.preferences[preferenceType]) {
      notes.preferences[preferenceType] = [];
    }
    
    // Add new preference
    notes.preferences[preferenceType].push({
      member_id: memberId,
      member_name: memberName,
      text: preferenceText,
      original_message: originalMessage,
      extracted_at: new Date().toISOString()
    });
    
    // Update trip notes
    await pool.query(
      `UPDATE trips SET notes = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(notes), tripId]
    );
    
    return { success: true };
  } catch (error) {
    console.error('Error adding trip preference:', error);
    throw error;
  }
}

export async function getTripPreferences(tripId) {
  try {
    const trip = await getTrip(tripId);
    if (!trip || !trip.notes) {
      return null;
    }
    
    let notes = {};
    try {
      notes = typeof trip.notes === 'string' ? JSON.parse(trip.notes) : trip.notes;
    } catch (e) {
      return null;
    }
    
    return notes.preferences || null;
  } catch (error) {
    console.error('Error getting trip preferences:', error);
    return null;
  }
}




