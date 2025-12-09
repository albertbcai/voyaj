import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { config } from './config/index.js';
import { messageQueue } from './queue/messageQueue.js';
import * as db from './db/queries.js';
import { generateInviteCode } from './utils/helpers.js';
import { checkStateTransitions } from './state/stateMachine.js';
import { twilioClient } from './utils/twilio.js';
import { callClaudeWithSystemPrompt } from './utils/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Set up file logging
const LOG_FILE = path.join(__dirname, '../logs/server.log');
const LOG_DIR = path.dirname(LOG_FILE);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create a write stream for logging
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

// Override console.log to also write to file
const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ${message}\n`);
  originalLog(...args);
};

console.error = (...args) => {
  const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)).join(' ');
  const timestamp = new Date().toISOString();
  logStream.write(`[${timestamp}] ERROR: ${message}\n`);
  originalError(...args);
};

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS for test UI
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Twilio webhook (for production)
app.post('/sms/incoming', async (req, res) => {
  try {
    const { From, Body, GroupId } = req.body;

    if (!From || !Body) {
      return res.status(400).send('Missing required fields');
    }

    // Find or create trip
    const trip = await findOrCreateTrip(From, GroupId);

    // Queue message
    await messageQueue.add(trip.id, {
      from: From,
      body: Body,
      groupChatId: GroupId,
      source: 'sms',
    });

    // Respond to Twilio immediately (required)
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling SMS:', error);
    res.status(500).send('Error');
  }
});

// Test endpoint (for local testing without Twilio)
app.post('/test/sms', async (req, res) => {
  try {
    const { from, body, groupId } = req.body;

    if (!from || !body) {
      return res.status(400).json({ error: 'Missing required fields: from, body' });
    }

    // Log incoming message
    console.log('\n' + '='.repeat(60));
    console.log(`📨 INCOMING MESSAGE [${new Date().toLocaleTimeString()}]`);
    console.log(`   From: ${from}`);
    console.log(`   Body: "${body}"`);
    if (groupId) console.log(`   Group ID: ${groupId}`);
    console.log('='.repeat(60));

    // Find or create trip
    const trip = await findOrCreateTrip(from, groupId || `test-group-${Date.now()}`);
    console.log(`   Trip ID: ${trip.id}`);
    console.log(`   Trip Stage: ${trip.stage}`);
    if (trip.destination) console.log(`   Destination: ${trip.destination}`);

    // Queue message
    await messageQueue.add(trip.id, {
      from,
      body,
      groupChatId: groupId || trip.group_chat_id,
      source: 'test',
    });

    console.log(`   ✅ Message queued for processing\n`);

    res.json({ success: true, tripId: trip.id });
  } catch (error) {
    console.error('❌ Error handling test SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all responses for a phone number
app.get('/test/responses/:phoneNumber', (req, res) => {
  const { phoneNumber } = req.params;
  const messages = twilioClient.getMessagesForRecipient(phoneNumber);
  res.json({ messages });
});

// Get latest response only (by phone number - for backward compatibility)
app.get('/test/responses/:phoneNumber/latest', (req, res) => {
  const { phoneNumber } = req.params;
  const message = twilioClient.getLatestMessageForRecipient(phoneNumber);
  res.json({ message });
});

// Get latest bot message for a group chat (by group ID)
// Cache last result per group to reduce logging noise
const groupEndpointCache = new Map();

app.get('/test/responses/group/:groupId/latest', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find trip by group ID
    const trip = await db.getTripByGroupChatId(groupId);
    if (!trip) {
      return res.json({ message: null });
    }
    
    // Get ALL recent messages from database (not just 1) to find the latest bot message
    const messages = await db.getRecentMessages(trip.id, 50);
    const botMessages = messages.filter(m => m.from_phone === 'bot' || m.source === 'bot');
    // Get the most recent bot message (last one in the array since getRecentMessages returns in chronological order)
    let latestBotMessage = botMessages.length > 0 ? botMessages[botMessages.length - 1] : null;
    let latestTimestamp = latestBotMessage ? new Date(latestBotMessage.received_at || latestBotMessage.created_at).getTime() : 0;
    
    // Also check MockTwilioClient for any messages sent to group members
    // (in case database hasn't been updated yet, or messages were sent before members existed)
    const members = await db.getMembers(trip.id);
    let latestTwilioMessage = null;
    
    // Check all members' phone numbers
    for (const member of members) {
      const twilioMsg = twilioClient.getLatestMessageForRecipient(member.phone_number);
      if (twilioMsg && twilioMsg.timestamp) {
        const msgTime = new Date(twilioMsg.timestamp).getTime();
        if (msgTime > latestTimestamp) {
          latestTimestamp = msgTime;
          latestTwilioMessage = twilioMsg;
        }
      }
    }
    
    // Also check the phone number from the request query (if provided) - useful for welcome message
    // This is important because welcome messages are sent before members join
    const phoneNumber = req.query.phoneNumber;
    if (phoneNumber) {
      const twilioMsg = twilioClient.getLatestMessageForRecipient(phoneNumber);
      if (twilioMsg && twilioMsg.timestamp) {
        const msgTime = new Date(twilioMsg.timestamp).getTime();
        if (msgTime > latestTimestamp) {
          latestTimestamp = msgTime;
          latestTwilioMessage = twilioMsg;
        }
      }
    }
    
    // Also check ALL sent messages in MockTwilioClient (fallback - in case phone number wasn't provided)
    // This helps catch messages sent to any phone number, especially welcome messages
    // Note: All messages in MockTwilioClient are bot messages (user messages go through /test/sms endpoint)
    const allSentMessages = twilioClient.getSentMessages();
    for (const msg of allSentMessages) {
      if (msg.timestamp) {
        const msgTime = new Date(msg.timestamp).getTime();
        if (msgTime > latestTimestamp) {
          latestTimestamp = msgTime;
          latestTwilioMessage = msg;
        }
      }
    }
    
    // Determine the result
    const resultMessage = latestTwilioMessage 
      ? { body: latestTwilioMessage.body, timestamp: latestTwilioMessage.timestamp }
      : latestBotMessage 
        ? { body: latestBotMessage.body, timestamp: latestBotMessage.received_at || latestBotMessage.created_at }
        : null;
    
    // Only log if result changed (new message found) or on first call
    const cachedResult = groupEndpointCache.get(groupId);
    const resultChanged = !cachedResult || 
                         (resultMessage && (!cachedResult.message || 
                          cachedResult.message.timestamp !== resultMessage.timestamp ||
                          cachedResult.message.body !== resultMessage.body));
    
    if (resultChanged) {
      if (latestTwilioMessage) {
        console.log(`   ✅ Group endpoint [${groupId}]: New message found from MockTwilioClient`);
      } else if (latestBotMessage) {
        console.log(`   ✅ Group endpoint [${groupId}]: New message found from database`);
      } else if (!cachedResult) {
        // Only log "no messages" on first call, not on every poll
        console.log(`   ⚠️  Group endpoint [${groupId}]: No bot messages found`);
      }
      groupEndpointCache.set(groupId, { message: resultMessage, timestamp: Date.now() });
    }
    
    // Clean up old cache entries (older than 5 minutes) to prevent memory leak
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    for (const [key, value] of groupEndpointCache.entries()) {
      if (value.timestamp < fiveMinutesAgo) {
        groupEndpointCache.delete(key);
      }
    }
    
    res.json({ message: resultMessage });
  } catch (error) {
    console.error(`   ❌ Group endpoint [${groupId}]: Error:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// Simulate adding Voyaj to a group chat (for testing)
app.post('/test/add-bot', async (req, res) => {
  try {
    const { groupId, phoneNumbers } = req.body;

    // Group ID is required - should be provided by Twilio in production
    // For testing, we'll generate one if not provided (though UI should always provide it)
    const finalGroupId = groupId || `test-group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log('\n' + '='.repeat(60));
    console.log('🤖 ADDING VOYAJ TO GROUP CHAT');
    console.log(`   Group ID: ${finalGroupId}`);
    if (phoneNumbers) console.log(`   Members: ${phoneNumbers.join(', ')}`);
    console.log('='.repeat(60));

    // Check if trip already exists for this group
    let trip = await db.getTripByGroupChatId(finalGroupId);
    
    if (trip) {
      console.log(`   ⚠️  Trip already exists for group ${finalGroupId}`);
      return res.json({ 
        success: false, 
        message: 'Voyaj is already in this group chat',
        tripId: trip.id,
        groupId: finalGroupId
      });
    }

    // Create new trip
    const { generateInviteCode } = await import('./utils/helpers.js');
    const inviteCode = generateInviteCode();
    trip = await db.createTrip({
      inviteCode,
      groupChatId: finalGroupId,
      stage: 'created',
    });

    console.log(`   ✅ Trip created: ${trip.id}`);

    // Send welcome message when Voyaj is added to the group
    // Don't create placeholder members - let people join by replying with their names
    const { twilioClient } = await import('./utils/twilio.js');
    
    // Update trip stage to collecting_members
    await db.updateTrip(trip.id, { stage: 'collecting_members', stage_entered_at: new Date() });
    
    // Send welcome message to provided phone numbers (in real Twilio, this would be a group message)
        const welcomeMessage = "What's up! 🎉 Voyaj here - I'm gonna help you all plan an awesome trip.\n\nFirst things first: reply with your name so I know who's in. Once we hit 2 people, we'll start picking where to go!\n\nReady? Let's do this! 🚀";
    
    if (phoneNumbers && phoneNumbers.length > 0) {
      // Send to all provided phone numbers (simulating group chat)
      for (const phone of phoneNumbers) {
        await twilioClient.sendSMS(phone, welcomeMessage);
      }
      console.log(`   📤 Welcome message sent to ${phoneNumbers.length} phone numbers`);
    } else {
      // In real Twilio, this would be sent as a group message automatically
      // For testing without phone numbers, we'll just log it
      console.log(`   ℹ️  No phone numbers provided - welcome message would be sent to group chat`);
      console.log(`   📝 Welcome message: "${welcomeMessage}"`);
    }

    console.log('='.repeat(60) + '\n');

    res.json({ 
      success: true, 
      message: 'Voyaj added to group chat',
      tripId: trip.id,
      groupId: finalGroupId,
      stage: trip.stage
    });
  } catch (error) {
    console.error('❌ Error adding bot to group:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset endpoint (for testing - clears all data)
// Advance time by 1 day for testing (updates all timestamps)
app.post('/test/advance-time', async (req, res) => {
  try {
    const { groupId } = req.body;
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId required' });
    }
    
    // Find trip by group ID
    const trip = await db.getTripByGroupChatId(groupId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    // Import pool for direct queries
    const { pool } = await import('./db/queries.js');
    
    // Update trip timestamps (only update last_nudge_at if column exists)
    try {
      await pool.query(
        `UPDATE trips 
         SET created_at = created_at - INTERVAL '1 day',
             updated_at = updated_at - INTERVAL '1 day',
             stage_entered_at = stage_entered_at - INTERVAL '1 day',
             last_nudge_at = CASE WHEN last_nudge_at IS NOT NULL THEN last_nudge_at - INTERVAL '1 day' ELSE NULL END
         WHERE id = $1`,
        [trip.id]
      );
    } catch (error) {
      // If last_nudge_at column doesn't exist, update without it
      if (error.code === '42703') { // Column does not exist
        await pool.query(
          `UPDATE trips 
           SET created_at = created_at - INTERVAL '1 day',
               updated_at = updated_at - INTERVAL '1 day',
               stage_entered_at = stage_entered_at - INTERVAL '1 day'
           WHERE id = $1`,
          [trip.id]
        );
      } else {
        throw error;
      }
    }
    
    // Update message timestamps
    await pool.query(
      `UPDATE messages 
       SET received_at = received_at - INTERVAL '1 day'
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    // Update date availability timestamps
    await pool.query(
      `UPDATE date_availability 
       SET submitted_at = submitted_at - INTERVAL '1 day'
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    // Update destination suggestions timestamps
    await pool.query(
      `UPDATE destination_suggestions 
       SET suggested_at = suggested_at - INTERVAL '1 day'
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    // Update votes timestamps
    await pool.query(
      `UPDATE votes 
       SET voted_at = voted_at - INTERVAL '1 day'
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    // Update flights timestamps
    await pool.query(
      `UPDATE flights 
       SET created_at = created_at - INTERVAL '1 day',
           departure_time = CASE WHEN departure_time IS NOT NULL THEN departure_time - INTERVAL '1 day' ELSE NULL END,
           arrival_time = CASE WHEN arrival_time IS NOT NULL THEN arrival_time - INTERVAL '1 day' ELSE NULL END
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    // Update members joined_at
    await pool.query(
      `UPDATE members 
       SET joined_at = joined_at - INTERVAL '1 day'
       WHERE trip_id = $1`,
      [trip.id]
    );
    
    console.log(`   ⏰ Advanced time by 1 day for trip ${trip.id}`);
    
    res.json({ 
      success: true, 
      message: 'Time advanced by 1 day',
      tripId: trip.id 
    });
  } catch (error) {
    console.error('Error advancing time:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/test/reset', async (req, res) => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🔄 RESET REQUESTED');
    console.log('='.repeat(60));
    
    const { pool } = await import('./db/queries.js');
    
    // Clear all tables (in reverse dependency order)
    await pool.query('DELETE FROM error_logs');
    await pool.query('DELETE FROM messages');
    await pool.query('DELETE FROM flights');
    await pool.query('DELETE FROM votes');
    await pool.query('DELETE FROM date_availability');
    await pool.query('DELETE FROM destination_suggestions');
    await pool.query('DELETE FROM members');
    await pool.query('DELETE FROM trips');
    
    // Clear mock Twilio messages
    twilioClient.clearSentMessages();
    
    console.log('✅ All data cleared');
    console.log('='.repeat(60) + '\n');
    
    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    console.error('❌ Error resetting:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to inspect what's actually stored in the DB
app.get('/test/debug/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;
    
    // Find trip by group ID
    const trip = await db.getTripByGroupChatId(groupId);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    
    const { pool } = await import('./db/queries.js');
    
    // Get all members
    const members = await db.getMembers(trip.id);
    const memberMap = new Map(members.map(m => [m.id, m]));
    
    // Get all destination suggestions with member info
    const destinationSuggestions = await pool.query(
      `SELECT ds.*, m.name as member_name, m.phone_number
       FROM destination_suggestions ds
       JOIN members m ON ds.member_id = m.id
       WHERE ds.trip_id = $1
       ORDER BY ds.suggested_at ASC`,
      [trip.id]
    );
    
    // Get all votes with member info
    const votes = await pool.query(
      `SELECT v.*, m.name as member_name, m.phone_number
       FROM votes v
       JOIN members m ON v.member_id = m.id
       WHERE v.trip_id = $1
       ORDER BY v.voted_at ASC`,
      [trip.id]
    );
    
    // Get recent messages that might have triggered these
    const recentMessages = await pool.query(
      `SELECT m.*, mem.name as member_name
       FROM messages m
       LEFT JOIN members mem ON m.from_phone = mem.phone_number AND m.trip_id = mem.trip_id
       WHERE m.trip_id = $1
       ORDER BY m.received_at DESC
       LIMIT 50`,
      [trip.id]
    );
    
    // Get date availability
    const dateAvailability = await pool.query(
      `SELECT da.*, m.name as member_name
       FROM date_availability da
       JOIN members m ON da.member_id = m.id
       WHERE da.trip_id = $1
       ORDER BY da.submitted_at ASC`,
      [trip.id]
    );
    
    // Build response with all the data
    const debugData = {
      trip: {
        id: trip.id,
        groupChatId: trip.group_chat_id,
        stage: trip.stage,
        destination: trip.destination,
        startDate: trip.start_date,
        endDate: trip.end_date,
        stageEnteredAt: trip.stage_entered_at,
      },
      members: members.map(m => ({
        id: m.id,
        name: m.name,
        phoneNumber: m.phone_number,
        joinedAt: m.joined_at,
      })),
      destinationSuggestions: destinationSuggestions.rows.map(ds => ({
        id: ds.id,
        destination: ds.destination, // THIS IS WHAT'S ACTUALLY STORED
        memberName: ds.member_name,
        memberPhone: ds.phone_number,
        suggestedAt: ds.suggested_at,
      })),
      votes: votes.rows.map(v => ({
        id: v.id,
        pollType: v.poll_type,
        choice: v.choice, // THIS IS WHAT'S ACTUALLY STORED
        memberName: v.member_name,
        memberPhone: v.phone_number,
        votedAt: v.voted_at,
      })),
      dateAvailability: dateAvailability.rows.map(da => ({
        id: da.id,
        memberName: da.member_name,
        startDate: da.start_date,
        endDate: da.end_date,
        isFlexible: da.is_flexible,
        submittedAt: da.submitted_at,
      })),
      recentMessages: recentMessages.rows.map(msg => ({
        id: msg.id,
        fromPhone: msg.from_phone,
        memberName: msg.member_name || 'Unknown',
        body: msg.body, // RAW MESSAGE TEXT
        receivedAt: msg.received_at,
      })),
    };
    
    res.json(debugData);
  } catch (error) {
    console.error('❌ Error getting debug data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate persona response (AI-powered)
app.post('/test/persona/generate', async (req, res) => {
  try {
    const { persona, chatHistory, casual } = req.body;

    if (!persona || !chatHistory) {
      return res.status(400).json({ error: 'Missing required fields: persona, chatHistory' });
    }

    // Build system prompt based on persona
    const systemPrompt = `You are ${persona.name}, ${persona.description}. 

Your personality traits:
${persona.traits.map(t => `- ${t}`).join('\n')}

${casual ? 'Send a casual, off-topic message that a real person might send in a group chat. Keep it short (1-2 sentences max).' : 'Respond naturally to the group chat conversation. Follow the trip planning flow when appropriate, but also feel free to add casual comments like a real person would.'}

Keep responses short and natural - this is SMS, not email.`;

    // Build user prompt with chat history
    const chatContext = chatHistory
      .slice(-10) // Last 10 messages for context
      .map(msg => `${msg.sender}: ${msg.text}`)
      .join('\n');

    const userPrompt = `Here's the recent group chat conversation:

${chatContext}

${persona.name}, what would you say next? Respond naturally as this persona would.`;

    // Generate response using Claude
    const response = await callClaudeWithSystemPrompt(systemPrompt, userPrompt, { 
      maxTokens: 150 
    });

    res.json({ 
      success: true, 
      message: response.trim(),
      persona: persona.name
    });
  } catch (error) {
    console.error('Error generating persona response:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve test UI (development only)
if (config.server.env === 'development') {
  // Set correct MIME type for JavaScript modules
  app.use('/test-ui', (req, res, next) => {
    if (req.path.endsWith('.js')) {
      res.type('application/javascript');
    }
    next();
  });
  
  app.use('/test-ui', express.static(path.join(__dirname, '../test-ui')));
  app.get('/test-ui', (req, res) => {
    res.sendFile(path.join(__dirname, '../test-ui/index.html'));
  });
}

// Helper: Find or create trip
async function findOrCreateTrip(phone, groupChatId) {
  // PRIORITY 1: Check if group chat has existing trip (group chat is the primary identifier)
  if (groupChatId) {
    const trip = await db.getTripByGroupChatId(groupChatId);
    if (trip) {
      return trip;
    }
  }

  // PRIORITY 2: If no groupChatId or no trip found for group, check if phone is in existing trip
  // BUT only if the trip's groupChatId matches (or is null/empty)
  const member = await db.getMemberByPhone(phone);
  if (member) {
    const trip = await db.getTrip(member.trip_id);
    if (trip) {
      // Only use this trip if:
      // 1. No groupChatId was provided (single-user mode), OR
      // 2. The trip's groupChatId matches the provided one, OR
      // 3. The trip has no groupChatId yet (legacy trip)
      if (!groupChatId || !trip.group_chat_id || trip.group_chat_id === groupChatId) {
        // Update group_chat_id if it changed
        if (groupChatId && trip.group_chat_id !== groupChatId) {
          await db.updateTrip(trip.id, { group_chat_id: groupChatId });
        }
        return trip;
      }
      // If groupChatId doesn't match, this is a different group - create new trip below
    }
  }

  // Create new trip
  const inviteCode = generateInviteCode();
  const trip = await db.createTrip({
    inviteCode,
    groupChatId,
    stage: 'created',
  });

  return trip;
}

// Start server
const PORT = config.server.port;
app.listen(PORT, async () => {
  console.log(`🚀 Voyaj server running on port ${PORT}`);
  console.log(`📱 Test endpoint: POST http://localhost:${PORT}/test/sms`);
  console.log(`📊 Health check: GET http://localhost:${PORT}/health`);
  if (config.server.env === 'development') {
    console.log(`🧪 Test UI: http://localhost:${PORT}/test-ui`);
  }
  
  // Start nudge scheduler
  if (config.server.env !== 'test') {
    const { nudgeScheduler } = await import('./scheduler/nudgeScheduler.js');
    nudgeScheduler.start();
  }
});




