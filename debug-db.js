import * as db from './src/db/queries.js';
import { pool } from './src/db/queries.js';

const groupId = 'group-1764436332872-kcub2ii6l';

async function debugDatabase() {
  try {
    // Find trip by group ID
    const trip = await db.getTripByGroupChatId(groupId);
    if (!trip) {
      console.error('Trip not found for groupId:', groupId);
      process.exit(1);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🔍 DATABASE DEBUG FOR GROUP:', groupId);
    console.log('='.repeat(80));
    console.log('\n📋 TRIP INFO:');
    console.log(`   ID: ${trip.id}`);
    console.log(`   Stage: ${trip.stage}`);
    console.log(`   Destination: ${trip.destination || '(not set)'}`);
    console.log(`   Start Date: ${trip.start_date || '(not set)'}`);
    console.log(`   End Date: ${trip.end_date || '(not set)'}`);
    
    // Get all members
    const members = await db.getMembers(trip.id);
    console.log(`\n👥 MEMBERS (${members.length}):`);
    members.forEach(m => {
      console.log(`   - ${m.name} (${m.phone_number}) - joined: ${m.joined_at}`);
    });
    
    // Get destination suggestions
    const destinationSuggestions = await pool.query(
      `SELECT ds.*, m.name as member_name, m.phone_number
       FROM destination_suggestions ds
       JOIN members m ON ds.member_id = m.id
       WHERE ds.trip_id = $1
       ORDER BY ds.suggested_at ASC`,
      [trip.id]
    );
    
    console.log(`\n✈️  DESTINATION SUGGESTIONS (${destinationSuggestions.rows.length}):`);
    if (destinationSuggestions.rows.length === 0) {
      console.log('   (none)');
    } else {
      destinationSuggestions.rows.forEach(ds => {
        console.log(`   - "${ds.destination}" (stored exactly as shown)`);
        console.log(`     Suggested by: ${ds.member_name} (${ds.phone_number})`);
        console.log(`     At: ${ds.suggested_at}`);
        console.log('');
      });
    }
    
    // Get votes
    const votes = await pool.query(
      `SELECT v.*, m.name as member_name, m.phone_number
       FROM votes v
       JOIN members m ON v.member_id = m.id
       WHERE v.trip_id = $1
       ORDER BY v.voted_at ASC`,
      [trip.id]
    );
    
    console.log(`\n🗳️  VOTES (${votes.rows.length}):`);
    if (votes.rows.length === 0) {
      console.log('   (none)');
    } else {
      votes.rows.forEach(v => {
        console.log(`   - Poll Type: ${v.poll_type}`);
        console.log(`     Choice: "${v.choice}" (stored exactly as shown)`);
        console.log(`     Voted by: ${v.member_name} (${v.phone_number})`);
        console.log(`     At: ${v.voted_at}`);
        console.log('');
      });
    }
    
    // Get recent messages
    const recentMessages = await pool.query(
      `SELECT m.*, mem.name as member_name
       FROM messages m
       LEFT JOIN members mem ON m.from_phone = mem.phone_number AND m.trip_id = mem.trip_id
       WHERE m.trip_id = $1
       ORDER BY m.received_at DESC
       LIMIT 30`,
      [trip.id]
    );
    
    console.log(`\n💬 RECENT MESSAGES (last 30):`);
    recentMessages.rows.reverse().forEach(msg => {
      console.log(`   [${msg.received_at}] ${msg.member_name || 'Unknown'} (${msg.from_phone}):`);
      console.log(`      "${msg.body}"`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Debug complete');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugDatabase();



