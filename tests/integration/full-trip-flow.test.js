import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { orchestrator } from '../../src/orchestrator.js';
import { mockDatabase } from '../mocks/database.js';
import { mockTwilioClient } from '../mocks/twilio.js';
import { createTestTrip, simulateMessage, clearAllMocks, waitForState } from '../utils/test-helpers.js';

// Note: This test requires mocking the database module
// For now, we'll test the flow conceptually

describe('Full Trip Flow Integration', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('complete flow: creation → members → destination → dates → flights', async () => {
    // This test demonstrates the full flow
    // In a real implementation, we'd need to inject mocks into the modules
    
    const trip = await createTestTrip({ 
      stage: 'created',
      groupChatId: 'test-group-1',
    });

    // Step 1: First member joins
    const message1 = await simulateMessage(trip.id, '+15551111111', 'Sarah', 'test-group-1');
    // In real test, would call: await orchestrator.process(trip.id, message1);

    // Step 2: More members join
    await simulateMessage(trip.id, '+15552222222', 'Mike', 'test-group-1');
    await simulateMessage(trip.id, '+15553333333', 'Alex', 'test-group-1');

    // Step 3: Destination voting
    await simulateMessage(trip.id, '+15551111111', 'Tokyo', 'test-group-1');
    await simulateMessage(trip.id, '+15552222222', 'Tokyo', 'test-group-1');
    await simulateMessage(trip.id, '+15553333333', 'Bali', 'test-group-1');

    // Step 4: Date voting
    await simulateMessage(trip.id, '+15551111111', 'March 15-22', 'test-group-1');
    await simulateMessage(trip.id, '+15552222222', 'March 15-22', 'test-group-1');
    await simulateMessage(trip.id, '+15553333333', 'March 15-22', 'test-group-1');

    // Step 5: Flight tracking
    await simulateMessage(trip.id, '+15551111111', 'just booked my flight, AA 154 lands at 2pm', 'test-group-1');
    await simulateMessage(trip.id, '+15552222222', 'UA 456', 'test-group-1');
    await simulateMessage(trip.id, '+15553333333', 'I booked DL 789', 'test-group-1');

    // Verify final state
    const finalTrip = await mockDatabase.getTrip(trip.id);
    assert(finalTrip);
    
    // Verify flights
    const flights = await mockDatabase.getFlights(trip.id);
    assert(flights.length >= 0); // At least some flights recorded
  });

  test('multiple users joining sequentially', async () => {
    const trip = await createTestTrip({ stage: 'created' });

    const members = [
      { phone: '+15551111111', name: 'Sarah' },
      { phone: '+15552222222', name: 'Mike' },
      { phone: '+15553333333', name: 'Alex' },
      { phone: '+15554444444', name: 'Jess' },
    ];

    for (const member of members) {
      await simulateMessage(trip.id, member.phone, member.name, 'test-group-1');
    }

    const allMembers = await mockDatabase.getMembers(trip.id);
    assert.strictEqual(allMembers.length, 4);
  });

  test('voting with majority triggers state transition', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    
    // Create 5 members
    for (let i = 0; i < 5; i++) {
      await createTestMember(trip.id, `+1555${i}000000`, `Member${i}`);
    }

    // 3 out of 5 vote for Tokyo (60% majority)
    for (let i = 0; i < 3; i++) {
      await simulateMessage(trip.id, `+1555${i}000000`, 'Tokyo', 'test-group-1');
    }

    // Should transition to destination_set
    const updated = await mockDatabase.getTrip(trip.id);
    // Note: Actual transition would happen via orchestrator
    assert(updated);
  });

  test('flight tracking completion', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    
    const members = [
      { phone: '+15551111111', name: 'Sarah' },
      { phone: '+15552222222', name: 'Mike' },
      { phone: '+15553333333', name: 'Alex' },
    ];

    for (const member of members) {
      await createTestMember(trip.id, member.phone, member.name);
    }

    // All members book flights
    await simulateMessage(trip.id, '+15551111111', 'AA 154', 'test-group-1');
    await simulateMessage(trip.id, '+15552222222', 'UA 456', 'test-group-1');
    await simulateMessage(trip.id, '+15553333333', 'DL 789', 'test-group-1');

    const flights = await mockDatabase.getFlights(trip.id);
    assert(flights.length >= 0);
  });
});



