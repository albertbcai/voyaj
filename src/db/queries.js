import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

const pool = new Pool({
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

// Error logs
export async function logError(tripId, error, context = {}) {
  await pool.query(
    `INSERT INTO error_logs (trip_id, error_message, stack_trace, context)
     VALUES ($1, $2, $3, $4)`,
    [tripId, error.message, error.stack, JSON.stringify(context)]
  );
}



