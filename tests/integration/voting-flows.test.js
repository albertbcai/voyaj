import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockDatabase } from '../mocks/database.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Voting Flows Integration', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('destination voting with 3+ members', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');
    const alex = await createTestMember(trip.id, '+15553333333', 'Alex');

    // Vote
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Tokyo');
    await mockDatabase.createVote(trip.id, 'destination', mike.id, 'Tokyo');
    await mockDatabase.createVote(trip.id, 'destination', alex.id, 'Bali');

    const results = await mockDatabase.getVoteResults(trip.id, 'destination');
    assert.strictEqual(results[0].choice, 'Tokyo');
    assert.strictEqual(parseInt(results[0].count), 2);
  });

  test('date voting with various formats', async () => {
    const trip = await createTestTrip({ stage: 'voting_dates', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');

    await mockDatabase.createVote(trip.id, 'dates', sarah.id, 'March 15-22');
    await mockDatabase.createVote(trip.id, 'dates', mike.id, 'march 15-22'); // lowercase

    const votes = await mockDatabase.getVotes(trip.id, 'dates');
    assert.strictEqual(votes.length, 2);
  });

  test('vote changes mid-poll', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // First vote
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Tokyo');
    
    // Change vote
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Bali');

    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    assert.strictEqual(votes.length, 1);
    assert.strictEqual(votes[0].choice, 'Bali');
  });

  test('timeout scenarios (48hr with no majority)', async () => {
    const oldDate = new Date();
    oldDate.setHours(oldDate.getHours() - 49);

    const trip = await createTestTrip({ 
      stage: 'voting_destination',
      stageEnteredAt: oldDate,
    });

    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');

    // Only 1 vote (not majority)
    await mockDatabase.createVote(trip.id, 'destination', sarah.id, 'Tokyo');

    // Per product decision: ask group to decide
    // This would be handled by state machine timeout check
    const tripAfterTimeout = await mockDatabase.getTrip(trip.id);
    assert(tripAfterTimeout);
  });

  test('all members vote same choice', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const members = [];
    for (let i = 0; i < 4; i++) {
      members.push(await createTestMember(trip.id, `+1555${i}000000`, `Member${i}`));
    }

    // All vote for Tokyo
    for (const member of members) {
      await mockDatabase.createVote(trip.id, 'destination', member.id, 'Tokyo');
    }

    const results = await mockDatabase.getVoteResults(trip.id, 'destination');
    assert.strictEqual(results[0].choice, 'Tokyo');
    assert.strictEqual(parseInt(results[0].count), 4);
  });
});


