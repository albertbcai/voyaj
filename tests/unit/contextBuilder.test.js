import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { contextBuilder } from '../../src/context/contextBuilder.js';
import { mockDatabase } from '../mocks/database.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Context Builder', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('builds minimal context with essential trip facts', async () => {
    const trip = await createTestTrip({ 
      stage: 'voting_destination',
      destination: 'Tokyo',
    });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const intent = { agent: 'coordinator' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    assert(context.trip);
    assert.strictEqual(context.trip.id, trip.id);
    assert.strictEqual(context.trip.stage, 'voting_destination');
    assert.strictEqual(context.trip.destination, 'Tokyo');
    assert(context.member);
    assert(context.allMembers);
  });

  test('builds agent-specific context for voting agent', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const intent = { agent: 'voting' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    assert(context.currentPoll);
    assert(context.existingVotes);
  });

  test('builds agent-specific context for parser agent', async () => {
    const trip = await createTestTrip({ stage: 'planning' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const intent = { agent: 'parser' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    assert(context.flights !== undefined);
  });

  test('builds agent-specific context for coordinator agent', async () => {
    const trip = await createTestTrip({ stage: 'planning' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const intent = { agent: 'coordinator' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    assert(context.recentMessages !== undefined);
  });

  test('handles missing data gracefully', async () => {
    const trip = await createTestTrip({ stage: 'created' });
    
    const intent = { agent: 'coordinator' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    // Member doesn't exist yet
    assert.strictEqual(context.member, null);
    assert(Array.isArray(context.allMembers));
  });

  test('includes all members in context', async () => {
    const trip = await createTestTrip({ stage: 'voting_destination' });
    await createTestMember(trip.id, '+15551111111', 'Sarah');
    await createTestMember(trip.id, '+15552222222', 'Mike');
    await createTestMember(trip.id, '+15553333333', 'Alex');

    const intent = { agent: 'coordinator' };
    const context = await contextBuilder.build(trip.id, '+15551111111', intent);

    assert.strictEqual(context.allMembers.length, 3);
  });
});



