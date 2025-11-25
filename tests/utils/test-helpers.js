// Test utility functions
import { randomUUID } from 'crypto';
import { mockDatabase } from '../mocks/database.js';
import { mockTwilioClient } from '../mocks/twilio.js';
import { mockClaudeClient } from '../mocks/claude.js';

export async function createTestTrip(data = {}) {
  const trip = await mockDatabase.createTrip({
    id: data.id || randomUUID(),
    inviteCode: data.inviteCode || `TEST${Date.now()}`,
    groupChatId: data.groupChatId || `group_${Date.now()}`,
    destination: data.destination,
    startDate: data.startDate,
    endDate: data.endDate,
    stage: data.stage || 'created',
    stageEnteredAt: data.stageEnteredAt || new Date(),
  });
  return trip;
}

export async function createTestMember(tripId, phoneNumber, name) {
  const member = await mockDatabase.createMember(tripId, phoneNumber, name);
  // Ensure member has proper ID format
  if (!member.id || typeof member.id !== 'string') {
    member.id = randomUUID();
  }
  return member;
}

export async function simulateMessage(tripId, fromPhone, body, groupChatId = null) {
  const message = {
    from: fromPhone,
    body: body,
    groupChatId: groupChatId || `group_${tripId}`,
    timestamp: new Date(),
  };
  
  // Save to database
  await mockDatabase.createMessage(tripId, fromPhone, body, groupChatId);
  
  return message;
}

export async function waitForState(tripId, expectedStage, maxWait = 5000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const trip = await mockDatabase.getTrip(tripId);
    if (trip && trip.stage === expectedStage) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

export function assertStateTransition(trip, fromStage, toStage) {
  if (trip.stage !== toStage) {
    throw new Error(`Expected stage ${toStage}, got ${trip.stage}`);
  }
}

export function getLastMessageTo(phoneNumber) {
  return mockTwilioClient.getLastMessageTo(phoneNumber);
}

export function getAllMessagesTo(phoneNumber) {
  return mockTwilioClient.getMessagesTo(phoneNumber);
}

export function clearAllMocks() {
  mockDatabase.reset();
  mockTwilioClient.clearSentMessages();
  mockClaudeClient.clearCalls();
  mockClaudeClient.clearResponses();
}

export function setupTestEnvironment() {
  clearAllMocks();
}

export function teardownTestEnvironment() {
  clearAllMocks();
}

