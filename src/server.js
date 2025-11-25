import express from 'express';
import { config } from './config/index.js';
import { messageQueue } from './queue/messageQueue.js';
import * as db from './db/queries.js';
import { generateInviteCode } from './utils/helpers.js';
import { checkStateTransitions } from './state/stateMachine.js';

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

    // Find or create trip
    const trip = await findOrCreateTrip(from, groupId || `test-group-${Date.now()}`);

    // Queue message
    await messageQueue.add(trip.id, {
      from,
      body,
      groupChatId: groupId || trip.group_chat_id,
      source: 'test',
    });

    res.json({ success: true, tripId: trip.id });
  } catch (error) {
    console.error('Error handling test SMS:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Find or create trip
async function findOrCreateTrip(phone, groupChatId) {
  // Check if phone is in existing trip
  const member = await db.getMemberByPhone(phone);

  if (member) {
    const trip = await db.getTrip(member.trip_id);
    if (trip) {
      // Update group_chat_id if it changed
      if (groupChatId && trip.group_chat_id !== groupChatId) {
        await db.updateTrip(trip.id, { group_chat_id: groupChatId });
      }
      return trip;
    }
  }

  // Check if group chat has existing trip
  if (groupChatId) {
    const trip = await db.getTripByGroupChatId(groupChatId);
    if (trip) {
      return trip;
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
app.listen(PORT, () => {
  console.log(`🚀 Voyaj server running on port ${PORT}`);
  console.log(`📱 Test endpoint: POST http://localhost:${PORT}/test/sms`);
  console.log(`📊 Health check: GET http://localhost:${PORT}/health`);
});



