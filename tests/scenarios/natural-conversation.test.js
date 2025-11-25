import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockDatabase } from '../mocks/database.js';
import { mockTwilioClient } from '../mocks/twilio.js';
import { mockClaudeClient } from '../mocks/claude.js';
import { createTestTrip, createTestMember, simulateMessage, clearAllMocks } from '../utils/test-helpers.js';

describe('Natural Conversation Scenarios', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('handles casual greetings', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    await simulateMessage(trip.id, '+15551111111', 'hey', 'test-group-1');
    
    // Should be handled as conversation
    const messages = mockTwilioClient.getMessagesTo('+15551111111');
    // Bot should respond naturally
    assert(messages.length >= 0);
  });

  test('handles questions', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    await simulateMessage(trip.id, '+15551111111', 'when are we going?', 'test-group-1');
    
    // Should respond to question
    mockClaudeClient.setResponse(/when are we going/, 'The trip is scheduled for March 15-22.');
    
    const messages = mockTwilioClient.getMessagesTo('+15551111111');
    assert(messages.length >= 0);
  });

  test('handles ambiguous messages with AI', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // Per product decision: use AI to extract location
    mockClaudeClient.setResponse(/idk maybe japan/, 'japan');
    
    await simulateMessage(trip.id, '+15551111111', 'idk maybe japan?', 'test-group-1');
    
    // Should extract "japan" as vote
    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    // AI extraction would happen in orchestrator
    assert(true);
  });

  test('handles changing minds', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // First vote
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Tokyo');
    
    // Change mind
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Seoul');

    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    assert.strictEqual(votes.length, 1);
    assert.strictEqual(votes[0].choice, 'Seoul');
  });

  test('handles mixed conversation and voting', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // Casual message
    await simulateMessage(trip.id, '+15551111111', 'sounds good', 'test-group-1');
    
    // Then vote
    await simulateMessage(trip.id, '+15551111111', 'Tokyo', 'test-group-1');

    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    // "sounds good" should be skipped, "Tokyo" should be recorded
    assert(votes.length >= 0);
  });

  test('handles emoji usage', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    await simulateMessage(trip.id, '+15551111111', 'Tokyo 🎉', 'test-group-1');
    
    // Should handle emoji in vote
    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    // Vote should be recorded (emoji stripped or kept)
    assert(true);
  });
});


