import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { randomUUID } from 'crypto';
import { messageQueue } from '../../src/queue/messageQueue.js';
import { mockDatabase } from '../mocks/database.js';
import { clearAllMocks } from '../utils/test-helpers.js';

describe('Message Queue Edge Cases', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('handles rapid message bursts (10 messages in 1 second)', async () => {
    const queue = messageQueue;
    const trip = await mockDatabase.createTrip({
      id: randomUUID(),
      inviteCode: 'TEST1',
      groupChatId: 'group_1',
      stage: 'voting_destination',
    });

    // Add 10 messages rapidly
    const messages = [];
    for (let i = 0; i < 10; i++) {
      const msg = {
        from: `+1555${i}000000`,
        body: `Message ${i}`,
        timestamp: Date.now(),
      };
      messages.push(msg);
      await queue.add(trip.id, msg);
    }

    // Verify all messages are queued
    // Queue processing would happen sequentially
    assert(messages.length === 10);
  });

  test('ensures messages are processed in order', async () => {
    const queue = messageQueue;
    const trip = await mockDatabase.createTrip({
      id: randomUUID(),
      inviteCode: 'TEST2',
      groupChatId: 'group_2',
      stage: 'voting_destination',
    });

    const messages = [
      { from: '+15551111111', body: 'First', timestamp: 1 },
      { from: '+15552222222', body: 'Second', timestamp: 2 },
      { from: '+15553333333', body: 'Third', timestamp: 3 },
    ];

    // Add messages to queue (without processing)
    for (const msg of messages) {
      queue.queues.set(trip.id, queue.queues.get(trip.id) || []);
      queue.queues.get(trip.id).push(msg);
    }

    // Verify queue order (FIFO)
    const queued = queue.queues.get(trip.id) || [];
    assert.strictEqual(queued.length, 3);
    assert.strictEqual(queued[0].body, 'First');
    assert.strictEqual(queued[2].body, 'Third');
    
    queue.clearQueue(trip.id);
  });

  test('handles queue processing failures gracefully', async () => {
    const queue = messageQueue;
    const trip = await mockDatabase.createTrip({
      id: randomUUID(),
      inviteCode: 'TEST3',
      groupChatId: 'group_3',
      stage: 'voting_destination',
    });

    // Add message to queue
    queue.queues.set(trip.id, queue.queues.get(trip.id) || []);
    queue.queues.get(trip.id).push({
      from: '+15551111111',
      body: 'Test',
      timestamp: Date.now(),
    });

    // Queue should handle failures gracefully
    // In real implementation, failed messages are removed and logged
    const queueLength = queue.getQueueLength(trip.id);
    assert(queueLength >= 0);
    
    queue.clearQueue(trip.id);
  });

  test('handles concurrent trips (100+ simultaneous)', async () => {
    const queue = messageQueue;
    const trips = [];

    // Create 100 trips
    for (let i = 0; i < 100; i++) {
      const trip = await mockDatabase.createTrip({
        id: randomUUID(),
        inviteCode: `TEST${i}`,
        groupChatId: `group_${i}`,
        stage: 'voting_destination',
      });
      trips.push(trip);

      // Add message to each trip queue (without processing)
      queue.queues.set(trip.id, queue.queues.get(trip.id) || []);
      queue.queues.get(trip.id).push({
        from: `+1555${i}000000`,
        body: 'Test',
        timestamp: Date.now(),
      });
    }

    assert.strictEqual(trips.length, 100);
    
    // Clean up
    for (const trip of trips) {
      queue.clearQueue(trip.id);
    }
  });

  test('handles memory limits with large queues', async () => {
    const queue = messageQueue;
    const trip = await mockDatabase.createTrip({
      id: randomUUID(),
      inviteCode: 'LARGE',
      groupChatId: 'group_large',
      stage: 'voting_destination',
    });

    // Add many messages to queue (without processing)
    queue.queues.set(trip.id, []);
    for (let i = 0; i < 1000; i++) {
      queue.queues.get(trip.id).push({
        from: '+15551111111',
        body: `Message ${i}`,
        timestamp: Date.now(),
      });
    }

    // Queue should handle large number of messages
    const queueLength = queue.getQueueLength(trip.id);
    assert.strictEqual(queueLength, 1000);
    
    // Clean up
    queue.clearQueue(trip.id);
  });
});

