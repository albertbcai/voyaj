// Nudge scheduler - background job to keep trips on track
import * as db from '../db/queries.js';
import { CoordinatorAgent } from '../agents/coordinator.js';
import { twilioClient } from '../utils/twilio.js';
import { config } from '../config/index.js';

const coordinatorAgent = new CoordinatorAgent();

// Testing mode: faster nudges for development
const TESTING_MODE = process.env.TESTING_MODE === 'true';

const NUDGE_INTERVALS = TESTING_MODE ? {
  first_nudge: 30 * 1000,      // 30 seconds
  second_nudge: 60 * 1000,     // 1 minute
  give_up: 180 * 1000,         // 3 minutes
} : {
  first_nudge: 6 * 60 * 60 * 1000,    // 6 hours
  second_nudge: 24 * 60 * 60 * 1000,  // 24 hours
  give_up: 72 * 60 * 60 * 1000,       // 72 hours
};

const NUDGE_RULES = {
  collecting_destinations: {
    first_nudge: NUDGE_INTERVALS.first_nudge,
    second_nudge: NUDGE_INTERVALS.second_nudge,
    give_up: NUDGE_INTERVALS.give_up,
  },
  voting_destination: {
    first_nudge: NUDGE_INTERVALS.first_nudge,
    second_nudge: NUDGE_INTERVALS.second_nudge,
    give_up: NUDGE_INTERVALS.give_up,
  },
  collecting_dates: {
    first_nudge: NUDGE_INTERVALS.first_nudge,
    second_nudge: NUDGE_INTERVALS.second_nudge,
    give_up: NUDGE_INTERVALS.give_up,
  },
  voting_dates: {
    first_nudge: NUDGE_INTERVALS.first_nudge,
    second_nudge: NUDGE_INTERVALS.second_nudge,
    give_up: NUDGE_INTERVALS.give_up,
  },
  tracking_flights: {
    first_nudge: 24 * 60 * 60 * 1000,   // 24 hours
    second_nudge: 48 * 60 * 60 * 1000,   // 48 hours
    escalate: 72 * 60 * 60 * 1000,       // 72 hours
    give_up: 14 * 24 * 60 * 60 * 1000,  // 14 days
  },
};

class NudgeScheduler {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  start() {
    if (this.isRunning) {
      console.log('Nudge scheduler already running');
      return;
    }

    this.isRunning = true;
    const interval = TESTING_MODE ? 10 * 1000 : 60 * 60 * 1000; // 10 seconds in testing, 1 hour in production

    console.log(`🕐 Nudge scheduler started (checking every ${interval / 1000}s)`);

    // Run immediately, then on interval
    this.checkAllTrips();

    this.intervalId = setInterval(() => {
      this.checkAllTrips();
    }, interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Nudge scheduler stopped');
  }

  async checkAllTrips() {
    try {
      const activeTrips = await db.getActiveTrips();
      console.log(`🕐 Checking ${activeTrips.length} active trips for nudges`);

      for (const trip of activeTrips) {
        await this.processTrip(trip);
      }
    } catch (error) {
      console.error('Error in nudge scheduler:', error);
    }
  }

  async processTrip(trip) {
    const rules = NUDGE_RULES[trip.stage];
    if (!rules) {
      return; // No nudging rules for this stage
    }

    const now = Date.now();
    const stageEnteredAt = new Date(trip.stage_entered_at).getTime();
    const timeSinceStageEntered = now - stageEnteredAt;
    const lastNudgeAt = trip.last_nudge_at ? new Date(trip.last_nudge_at).getTime() : 0;
    const timeSinceLastNudge = now - lastNudgeAt;
    const nudgeCount = trip.nudge_count || 0;

    // Don't nudge too frequently (at least 6 hours between nudges)
    if (timeSinceLastNudge < 6 * 60 * 60 * 1000 && !TESTING_MODE) {
      return;
    }

    // Check if we should give up
    if (timeSinceStageEntered > rules.give_up) {
      await this.markTripDead(trip);
      return;
    }

    // Special handling for flight tracking
    if (trip.stage === 'tracking_flights') {
      await this.handleFlightNudging(trip, rules, timeSinceStageEntered);
      return;
    }

    // Standard nudging logic
    if (nudgeCount === 0 && timeSinceStageEntered > rules.first_nudge) {
      await this.sendNudge(trip, 'low');
    } else if (nudgeCount === 1 && timeSinceStageEntered > rules.second_nudge) {
      await this.sendNudge(trip, 'high');
    }
  }

  async handleFlightNudging(trip, rules, timeSinceStageEntered) {
    // Flight nudging is handled by coordinator agent
    await coordinatorAgent.checkFlightBookingStatus(trip);
  }

  async sendNudge(trip, urgency) {
    const nonResponders = await this.getNonResponders(trip);
    
    if (nonResponders.length === 0) {
      return; // Everyone has responded
    }

    const nudgeText = await this.craftNudge(trip, nonResponders, urgency);
    
    // Send to group
    const members = await db.getMembers(trip.id);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, nudgeText);
    }

    // Update trip
    await db.updateTrip(trip.id, {
      nudge_count: (trip.nudge_count || 0) + 1,
      last_nudge_at: new Date(),
    });

    console.log(`📤 Sent ${urgency} nudge to trip ${trip.id} (nudge #${(trip.nudge_count || 0) + 1})`);
  }

  async getNonResponders(trip) {
    const members = await db.getMembers(trip.id);
    
    if (trip.stage === 'collecting_destinations') {
      const suggestions = await db.getDestinationSuggestions(trip.id);
      const suggested = new Set(suggestions.map(s => s.member_id));
      return members.filter(m => !suggested.has(m.id));
    } else if (trip.stage === 'voting_destination') {
      const votes = await db.getVotes(trip.id, 'destination');
      const voted = new Set(votes.map(v => v.member_id));
      return members.filter(m => !voted.has(m.id));
    } else if (trip.stage === 'collecting_dates') {
      const availability = await db.getDateAvailability(trip.id);
      const submitted = new Set(availability.map(a => a.member_id));
      return members.filter(m => !submitted.has(m.id));
    } else if (trip.stage === 'voting_dates') {
      const votes = await db.getVotes(trip.id, 'dates');
      const voted = new Set(votes.map(v => v.member_id));
      return members.filter(m => !voted.has(m.id));
    } else if (trip.stage === 'tracking_flights') {
      const flights = await db.getFlights(trip.id);
      const booked = new Set(flights.map(f => f.member_id));
      return members.filter(m => !booked.has(m.id));
    }
    
    return [];
  }

  async craftNudge(trip, nonResponders, urgency) {
    const names = nonResponders.map(m => m.name).join(', ');
    const stageMessages = {
      collecting_destinations: {
        low: `${names} - still waiting on destination suggestions! Where do you want to go?`,
        high: `${names} - we need your destination ideas to move forward! Reply with where you'd like to visit.`,
      },
      voting_destination: {
        low: `${names} - still waiting on your vote! Check the options and reply with the number.`,
        high: `${names} - vote now! We're waiting on you to decide the destination.`,
      },
      collecting_dates: {
        low: `${names} - still waiting on your date availability! When can you go?`,
        high: `${names} - we need your dates to find overlap! Reply with your available dates.`,
      },
      voting_dates: {
        low: `${names} - still waiting on your vote! Check the date options and reply with the number.`,
        high: `${names} - vote now! We're waiting on you to lock in dates.`,
      },
    };

    const messages = stageMessages[trip.stage];
    if (messages) {
      return messages[urgency] || messages.low;
    }

    // Fallback
    return `${names} - we're waiting on you! Please respond.`;
  }

  async markTripDead(trip) {
    await db.updateTrip(trip.id, {
      stage: 'completed', // Or create a 'dead' stage
    });
    console.log(`💀 Marked trip ${trip.id} as dead (no activity for too long)`);
  }
}

export const nudgeScheduler = new NudgeScheduler();

// Auto-start if not in test mode
if (config.server.env !== 'test') {
  nudgeScheduler.start();
}

