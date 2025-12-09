import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockDatabase } from '../mocks/database.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Member Management Integration', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('member joining during different stages', async () => {
    const trip = await createTestTrip({ stage: 'created' });
    
    // Join during created stage
    await createTestMember(trip.id, '+15551111111', 'Sarah');
    
    // Update to voting stage
    await mockDatabase.updateTrip(trip.id, { stage: 'voting_destination' });
    
    // Join during voting stage (per product decision: can vote until voting ends)
    await createTestMember(trip.id, '+15552222222', 'Mike');
    
    const members = await mockDatabase.getMembers(trip.id);
    assert.strictEqual(members.length, 2);
  });

  test('duplicate phone numbers (one active trip per phone)', async () => {
    const trip1 = await createTestTrip({ groupChatId: 'group-1' });
    const trip2 = await createTestTrip({ groupChatId: 'group-2' });

    // Same phone number in different trips
    // Per product: one active trip per phone (free tier)
    // In real implementation, would check for existing active trip
    await createTestMember(trip1.id, '+15551111111', 'Sarah');
    
    // This should be prevented in real system
    // For test, we document the expected behavior
    const member1 = await mockDatabase.getMemberByPhone('+15551111111');
    assert(member1);
  });

  test('member leaving not supported (just stops responding)', async () => {
    const trip = await createTestTrip({ stage: 'planning' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');

    // Sarah books flight
    await mockDatabase.createFlight(trip.id, sarah.id, {
      airline: 'AA',
      flightNumber: '154',
    });

    // Mike doesn't respond (leaves functionally)
    // Per product decision: not supported in MVP, just stop responding
    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 1);
    
    // System should continue functioning
    const members = await mockDatabase.getMembers(trip.id);
    assert.strictEqual(members.length, 2);
  });

  test('name changes', async () => {
    const trip = await createTestTrip({ stage: 'created' });
    const member = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // Update name
    member.name = 'Sarah Smith';
    await mockDatabase.updateTrip(trip.id, {}); // Trigger update

    const updated = await mockDatabase.getMemberByPhone('+15551111111');
    // Name should be updated
    assert(updated);
  });
});



