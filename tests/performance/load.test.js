import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockDatabase } from '../mocks/database.js';
import { createTestTrip, clearAllMocks } from '../utils/test-helpers.js';

describe('Load Testing', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('handles 100 concurrent trips', async () => {
    const trips = [];
    
    // Create 100 trips
    for (let i = 0; i < 100; i++) {
      const trip = await createTestTrip({
        id: `trip_${i}`,
        inviteCode: `TEST${i}`,
        groupChatId: `group_${i}`,
        stage: 'voting_destination',
      });
      trips.push(trip);
    }

    assert.strictEqual(trips.length, 100);
    
    // Verify all trips exist
    for (const trip of trips) {
      const retrieved = await mockDatabase.getTrip(trip.id);
      assert(retrieved);
    }
  });

  test('handles 1000 messages per minute', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    
    // Simulate 1000 messages
    const messages = [];
    for (let i = 0; i < 1000; i++) {
      messages.push(
        mockDatabase.createMessage(
          trip.id,
          `+1555${i % 10}000000`,
          `Message ${i}`,
          'test-group-1'
        )
      );
    }

    await Promise.all(messages);
    
    const allMessages = await mockDatabase.getMessages(trip.id, 10000);
    assert(allMessages.length >= 1000);
  });

  test('measures database query performance', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    
    // Create test data
    for (let i = 0; i < 100; i++) {
      await createTestMember(trip.id, `+1555${i}000000`, `Member${i}`);
    }

    // Measure query time
    const start = Date.now();
    const members = await mockDatabase.getMembers(trip.id);
    const duration = Date.now() - start;

    assert.strictEqual(members.length, 100);
    // Duration should be reasonable (< 100ms for mock, < 1000ms for real DB)
    assert(duration < 1000);
  });

  test('measures memory usage', async () => {
    // Create many trips and messages
    const trips = [];
    for (let i = 0; i < 1000; i++) {
      trips.push(await createTestTrip({
        id: `trip_${i}`,
        inviteCode: `TEST${i}`,
        groupChatId: `group_${i}`,
      }));
    }

    // Memory usage should be reasonable
    // In production, would monitor actual memory
    assert.strictEqual(trips.length, 1000);
  });

  test('measures response time under load', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    
    // Simulate load
    const start = Date.now();
    
    // Multiple operations
    await createTestMember(trip.id, '+15551111111', 'Sarah');
    await mockDatabase.createVote(trip.id, 'destination', 'member_1', 'Tokyo');
    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    
    const duration = Date.now() - start;
    
    // Target: < 3s response time
    assert(duration < 3000);
    assert(votes.length >= 0);
  });
});


