import * as db from './../db/queries.js';
import { emitEvent, EVENTS } from './eventEmitter.js';

const STAGES = {
  created: {
    next: 'collecting_members',
    trigger: 'first_member_joined',
  },

  collecting_members: {
    next: 'voting_destination',
    trigger: 'enough_members',
    condition: async (trip) => {
      const memberCount = await db.getMemberCount(trip.id);
      return memberCount >= 3;
    },
  },

  voting_destination: {
    next: 'destination_set',
    trigger: 'poll_complete',
    condition: async (trip) => {
      const votes = await db.getVotes(trip.id, 'destination');
      const members = await db.getMembers(trip.id);
      const majority = votes.length >= Math.ceil(members.length * 0.6);
      const timeout = Date.now() - new Date(trip.stage_entered_at).getTime() > 48 * 60 * 60 * 1000;
      return majority || timeout;
    },
  },

  destination_set: {
    next: 'voting_dates',
    trigger: 'immediate',
  },

  voting_dates: {
    next: 'dates_set',
    trigger: 'poll_complete',
    condition: async (trip) => {
      const votes = await db.getVotes(trip.id, 'dates');
      const members = await db.getMembers(trip.id);
      const majority = votes.length >= Math.ceil(members.length * 0.6);
      const timeout = Date.now() - new Date(trip.stage_entered_at).getTime() > 48 * 60 * 60 * 1000;
      return majority || timeout;
    },
  },

  dates_set: {
    next: 'planning',
    trigger: 'immediate',
  },

  planning: {
    next: 'active',
    trigger: 'trip_start_date',
    condition: async (trip) => {
      if (!trip.start_date) return false;
      const startDate = new Date(trip.start_date);
      return Date.now() >= startDate.getTime();
    },
  },

  active: {
    next: 'completed',
    trigger: 'trip_end_date',
    condition: async (trip) => {
      if (!trip.end_date) return false;
      const endDate = new Date(trip.end_date);
      return Date.now() >= endDate.getTime();
    },
  },

  completed: {
    next: null,
  },
};

export async function checkStateTransitions(tripId) {
  const trip = await db.getTrip(tripId);
  if (!trip) return;

  const stage = STAGES[trip.stage];
  if (!stage || !stage.next) return; // Final state

  // Check condition
  const shouldTransition = stage.condition ? await stage.condition(trip) : true;

  if (shouldTransition) {
    const oldStage = trip.stage;
    const newStage = stage.next;

    // Update to next stage
    await db.updateTrip(tripId, {
      stage: newStage,
      stage_entered_at: new Date(),
    });

    emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: oldStage, to: newStage });

    // Check if next stage immediately transitions
    await checkStateTransitions(tripId);
  }
}



