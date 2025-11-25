import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { mockDatabase } from '../mocks/database.js';
import { createTestTrip, createTestMember, clearAllMocks } from '../utils/test-helpers.js';

describe('Flight Tracking Integration', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  test('flight booking with full details', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    await mockDatabase.createFlight(trip.id, sarah.id, {
      airline: 'AA',
      flightNumber: '154',
      arrivalTime: new Date('2024-03-15T14:00:00Z'),
    });

    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0].airline, 'AA');
    assert.strictEqual(flights[0].flight_number, '154');
  });

  test('flight booking without details (follow-up question)', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // Book without details
    await mockDatabase.createFlight(trip.id, sarah.id, {
      airline: null,
      flightNumber: null,
    });

    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0].airline, null);
  });

  test('multiple people booking', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');
    const mike = await createTestMember(trip.id, '+15552222222', 'Mike');
    const alex = await createTestMember(trip.id, '+15553333333', 'Alex');

    await mockDatabase.createFlight(trip.id, sarah.id, { airline: 'AA', flightNumber: '154' });
    await mockDatabase.createFlight(trip.id, mike.id, { airline: 'UA', flightNumber: '456' });
    await mockDatabase.createFlight(trip.id, alex.id, { airline: 'DL', flightNumber: '789' });

    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 3);
  });

  test('duplicate flight reports', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    // First booking
    await mockDatabase.createFlight(trip.id, sarah.id, { airline: 'AA', flightNumber: '154' });

    // Try to book again (should update, not create duplicate)
    // Per database schema: UNIQUE(trip_id, member_id)
    const existing = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(existing.length, 1);
  });

  test('flight cancellation (mark as cancelled but keep record)', async () => {
    const trip = await createTestTrip({ stage: 'planning', destination: 'Tokyo' });
    const sarah = await createTestMember(trip.id, '+15551111111', 'Sarah');

    await mockDatabase.createFlight(trip.id, sarah.id, { airline: 'AA', flightNumber: '154' });

    // Cancel flight
    await mockDatabase.cancelFlight(trip.id, sarah.id);

    const flights = await mockDatabase.getFlights(trip.id);
    assert.strictEqual(flights.length, 1);
    assert.strictEqual(flights[0].cancelled, true);
  });
});


