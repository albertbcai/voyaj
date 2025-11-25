import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ParserAgent } from '../../src/agents/parser.js';
import { mockDatabase } from '../mocks/database.js';
import { mockTwilioClient } from '../mocks/twilio.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Parser Agent', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('extracts flight number from AA 154 format', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
    };

    const parsed = agent.parseWithRules('just booked my flight, AA 154 lands at 2pm');
    
    assert.strictEqual(parsed.confidence, 0.9);
    assert.strictEqual(parsed.airline, 'AA');
    assert.strictEqual(parsed.flightNumber, '154');
    assert.strictEqual(parsed.booked, true);
  });

  test('extracts flight number from UA456 format (no space)', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const parsed = agent.parseWithRules('I got United 456');

    assert.strictEqual(parsed.confidence, 0.9);
    assert.strictEqual(parsed.airline, 'UA');
    assert.strictEqual(parsed.flightNumber, '456');
  });

  test('extracts time from various formats', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    
    const parsed1 = agent.parseWithRules('AA 154 lands at 2pm');
    assert(parsed1.time);

    const parsed2 = agent.parseWithRules('UA 456 arrives 14:00');
    assert(parsed2.time);
  });

  test('handles ambiguous flight messages', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const parsed = agent.parseWithRules('I booked');

    assert.strictEqual(parsed.confidence, 0.5);
    assert.strictEqual(parsed.booked, true);
    assert.strictEqual(parsed.airline, null);
    assert.strictEqual(parsed.flightNumber, null);
  });

  test('handles multiple flights in one message', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
    };

    // Mock AI to return multiple flights
    const { mockClaudeClient } = await import('../mocks/claude.js');
    mockClaudeClient.setResponse(/Extract flight information/, JSON.stringify({
      booked: true,
      airline: 'AA',
      flightNumber: '154',
      departureTime: null,
      arrivalTime: null,
    }));

    await agent.handle(context, { from: '+15551111111', body: 'I booked AA 154 and UA 456' });

    // Should store both flights and ask for clarification
    const flights = await mockDatabase.getFlights(trip.id);
    assert(flights.length > 0);
    
    const message = mockTwilioClient.getLastMessageTo('+15551111111');
    assert(message.body.includes('clarify') || message.body.includes('which'));
  });

  test('handles invalid flight formats', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const parsed = agent.parseWithRules('I think I might book something');

    assert.strictEqual(parsed.confidence, 0);
    assert.strictEqual(parsed.booked, undefined);
  });

  test('creates flight record with full details', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    const agent = new ParserAgent();
    const context = {
      trip,
      member: sarah,
      allMembers: [sarah],
    };

    const { mockClaudeClient } = await import('../mocks/claude.js');
    mockClaudeClient.setResponse(/Extract flight information/, JSON.stringify({
      booked: true,
      airline: 'AA',
      flightNumber: '154',
      departureTime: '2024-03-15T10:00:00Z',
      arrivalTime: '2024-03-15T14:00:00Z',
    }));

    await agent.handle(context, { from: '+15551111111', body: 'AA 154 lands at 2pm' });

    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0].airline, 'AA');
    assert.strictEqual(flights[0].flight_number, '154');
  });
});


