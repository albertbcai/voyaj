import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { VotingAgent } from '../../src/agents/voting.js';
import { mockDatabase } from '../mocks/database.js';
import { mockTwilioClient } from '../mocks/twilio.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Voting Agent', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('tallies votes correctly with multiple choices', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');
    const alex = await createTestMember(trip.id, '+15553333333', 'Alex');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah, mike, alex],
      currentPoll: { type: 'destination' },
      existingVotes: [],
    };

    // Sarah votes Tokyo
    await agent.handle(context, { from: '+15551111111', body: 'Tokyo' });
    
    // Mike votes Tokyo
    const context2 = {
      ...context,
      member: mike,
      existingVotes: await mockDatabase.getVotes(trip.id, 'destination'),
    };
    await agent.handle(context2, { from: '+15552222222', body: 'Tokyo' });

    // Alex votes Bali
    const context3 = {
      ...context,
      member: alex,
      existingVotes: await mockDatabase.getVotes(trip.id, 'destination'),
    };
    await agent.handle(context3, { from: '+15553333333', body: 'Bali' });

    const results = await mockDatabase.getVoteResults(trip.id, 'destination');
    assert.strictEqual(results[0].choice, 'Tokyo');
    assert.strictEqual(parseInt(results[0].count), 2);
  });

  test('calculates majority correctly (60% threshold)', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const members = [];
    for (let i = 0; i < 5; i++) {
      members.push(await createTestMember(trip.id, `+1555${i}000000`, `Member${i}`));
    }

    const agent = new VotingAgent();
    
    // 3 out of 5 = 60% (majority)
    for (let i = 0; i < 3; i++) {
      const context = {
        trip,
        member: members[i],
        allMembers: members,
        currentPoll: { type: 'destination' },
        existingVotes: await mockDatabase.getVotes(trip.id, 'destination'),
      };
      await agent.handle(context, { from: members[i].phone_number, body: 'Tokyo' });
    }

    const updatedTrip = await mockDatabase.getTrip(trip.id);
    // Should have transitioned to destination_set
    assert.strictEqual(updatedTrip.destination, 'Tokyo');
  });

  test('handles vote updates (changing vote)', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
      currentPoll: { type: 'destination' },
      existingVotes: [],
    };

    // First vote
    await agent.handle(context, { from: '+15551111111', body: 'Tokyo' });
    
    // Change vote
    const context2 = {
      ...context,
      existingVotes: await mockDatabase.getVotes(trip.id, 'destination'),
    };
    await agent.handle(context2, { from: '+15551111111', body: 'Bali' });

    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    assert.strictEqual(votes.length, 1);
    assert.strictEqual(votes[0].choice, 'Bali');
    
    const message = mockTwilioClient.getLastMessageTo('+15551111111');
    assert(message.body.includes('Updated your vote'));
  });

  test('handles tie-breaking by extending voting period', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah, mike],
      currentPoll: { type: 'destination' },
      existingVotes: [],
    };

    // Sarah votes Tokyo
    await agent.handle(context, { from: '+15551111111', body: 'Tokyo' });
    
    // Mike votes Bali (tie)
    const context2 = {
      ...context,
      member: mike,
      existingVotes: await mockDatabase.getVotes(trip.id, 'destination'),
    };
    await agent.handle(context2, { from: '+15552222222', body: 'Bali' });

    // Check that tie was detected and voting extended
    const results = await mockDatabase.getVoteResults(trip.id, 'destination');
    assert.strictEqual(results.length, 2);
    assert.strictEqual(parseInt(results[0].count), 1);
    assert.strictEqual(parseInt(results[1].count), 1);
    
    // Should ask group to break tie
    const messages = mockTwilioClient.getSentMessages();
    const tieMessage = messages.find(m => m.body.includes('tie') || m.body.includes('break'));
    assert(tieMessage, 'Should send tie-breaking message');
  });

  test('skips casual conversation messages', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
      currentPoll: { type: 'destination' },
      existingVotes: [],
    };

    const result = await agent.handle(context, { from: '+15551111111', body: 'sounds good' });
    
    assert.strictEqual(result.skip, true);
    const votes = await mockDatabase.getVotes(trip.id, 'destination');
    assert.strictEqual(votes.length, 0);
  });

  test('parses dates from vote choices', async () => {
    const trip = await createTestTrip({ stage: 'voting_dates', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
      currentPoll: { type: 'dates' },
      existingVotes: [],
    };

    await agent.handle(context, { from: '+15551111111', body: 'March 15-22' });
    
    const votes = await mockDatabase.getVotes(trip.id, 'dates');
    assert.strictEqual(votes.length, 1);
    assert.strictEqual(votes[0].choice, 'March 15-22');
  });

  test('handles invalid date format gracefully', async () => {
    const trip = await createTestTrip({ stage: 'voting_dates', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new VotingAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
      currentPoll: { type: 'dates' },
      existingVotes: [],
    };

    // This should still record the vote, but closing poll will fail to parse
    await agent.handle(context, { from: '+15551111111', body: 'sometime in march' });
    
    const votes = await mockDatabase.getVotes(trip.id, 'dates');
    assert.strictEqual(votes.length, 1);
  });
});



