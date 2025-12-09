import * as db from './../db/queries.js';
import { emitEvent, EVENTS } from './eventEmitter.js';

const STAGES = {
  created: {
    next: 'collecting_members',
    trigger: 'first_member_joined',
  },

  collecting_members: {
    next: 'planning',
    trigger: 'enough_members',
    condition: async (trip) => {
      const memberCount = await db.getMemberCount(trip.id);
      return memberCount >= 2;
    },
    action: async (trip, agents) => {
      const members = await db.getMembers(trip.id);
      const memberNames = members.map(m => m.name).join(', ');
      return {
        output: {
          type: 'status_update',
          status: `Awesome! We have ${members.length} people: ${memberNames} 🎉`,
          details: `Time to plan! We need to figure out WHERE and WHEN.\n\nYou can share:\n• A destination idea (e.g., "Tokyo", "Bali", "Portugal")\n• Your date availability (e.g., "March 15-22" or "I'm flexible in April")\n\nLet's start with whatever you know first!`,
          sendTo: 'group',
        },
      };
    },
  },

  // Flexible planning state - allows both destination and dates to be collected simultaneously
  planning: {
    next: null, // Dynamic - can go to voting_destination, voting_dates, or destination_set/dates_set
    trigger: 'check_whats_ready',
    condition: async (trip) => {
      // This state doesn't auto-transition - transitions are handled by agents
      // based on what's ready (destination suggestions vs date availability)
      return false; // Never auto-transition from planning
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
    action: async (trip, agents) => {
      // Get destination suggestions and create voting message
      const suggestions = await db.getDestinationSuggestions(trip.id);
      const votingAgent = agents.voting;
      const uniqueDestinations = votingAgent.consolidateSuggestions(suggestions);
      const members = await db.getMembers(trip.id);
      const memberCount = members.length;
      const majorityThreshold = Math.ceil(memberCount * 0.6);
      
      return {
        output: {
          type: 'poll_started',
          pollType: 'destination',
          options: uniqueDestinations,
          memberCount,
          majorityThreshold,
          sendTo: 'group',
        },
      };
    },
  },

  destination_set: {
    next: null, // Dynamic - check if dates are set
    trigger: 'immediate',
    condition: async (trip) => {
      // Always transition immediately
      return true;
    },
    action: async (trip, agents) => {
      // Check if dates are already set
      const hasDates = trip.start_date && trip.end_date;
      if (hasDates) {
        // Both destination and dates are set - move to tracking flights
        // Update stage directly (state machine will handle transition)
        await db.updateTrip(trip.id, { stage: 'tracking_flights', stage_entered_at: new Date() });
        return {
          output: {
            type: 'status_update',
            status: `Perfect! We're going to ${trip.destination}! 🎉`,
            details: `📍 ${trip.destination}\n📅 ${new Date(trip.start_date).toLocaleDateString()} - ${new Date(trip.end_date).toLocaleDateString()}\n\nTime to book flights! ✈️\n\nText me when you book: "BOOKED [airline] [flight number]" or just "BOOKED"`,
            sendTo: 'group',
          },
        };
      } else {
        // Destination set, but still need dates - go back to planning
        await db.updateTrip(trip.id, { stage: 'planning', stage_entered_at: new Date() });
        return {
          output: {
            type: 'status_update',
            status: `Great! We're going to ${trip.destination}! 🎉`,
            details: `Now we need dates! When are you available?\n\n📅 Reply with your date availability.\n\nExamples:\n• "March 15-22"\n• "I'm flexible in April"\n• "Late May or early June"`,
            sendTo: 'group',
          },
        };
      }
    },
  },

  dates_set: {
    next: null, // Dynamic - check if destination is set
    trigger: 'immediate',
    condition: async (trip) => {
      // Always transition immediately
      return true;
    },
    action: async (trip, agents) => {
      // Check if destination is already set
      const hasDestination = trip.destination;
      if (hasDestination) {
        // Both destination and dates are set - move to tracking flights
        // Update stage directly (state machine will handle transition)
        await db.updateTrip(trip.id, { stage: 'tracking_flights', stage_entered_at: new Date() });
        const startDate = new Date(trip.start_date).toLocaleDateString();
        const endDate = new Date(trip.end_date).toLocaleDateString();
        return {
          output: {
            type: 'status_update',
            status: `Perfect! Dates locked in: ${startDate} - ${endDate} 📅`,
            details: `📍 ${trip.destination}\n📅 ${startDate} - ${endDate}\n\nTime to book flights! ✈️\n\nText me when you book: "BOOKED [airline] [flight number]" or just "BOOKED"`,
            sendTo: 'group',
          },
        };
      } else {
        // Dates set, but still need destination - go back to planning
        await db.updateTrip(trip.id, { stage: 'planning', stage_entered_at: new Date() });
        const startDate = new Date(trip.start_date).toLocaleDateString();
        const endDate = new Date(trip.end_date).toLocaleDateString();
        return {
          output: {
            type: 'status_update',
            status: `Great! Dates locked in: ${startDate} - ${endDate} 📅`,
            details: `Now we need a destination! Where do you want to go?\n\n🌍 Share destination ideas - suggest any places that excite you! You can suggest multiple places.\n\nExamples: "Tokyo", "Bali", "Portugal", "Iceland"`,
            sendTo: 'group',
          },
        };
      }
    },
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
    action: async (trip, agents) => {
      // Get date availability and create voting message
      const availability = await db.getDateAvailability(trip.id);
      const { findOverlappingDates } = await import('./../utils/dateOverlap.js');
      const options = findOverlappingDates(availability);
      const members = await db.getMembers(trip.id);
      const memberCount = members.length;
      const majorityThreshold = Math.ceil(memberCount * 0.6);
      
      return {
        output: {
          type: 'poll_started',
          pollType: 'dates',
          options: options.map(o => o.display),
          memberCount,
          majorityThreshold,
          sendTo: 'group',
        },
      };
    },
  },

  dates_set: {
    next: 'tracking_flights',
    trigger: 'immediate',
    action: async (trip, agents) => {
      const startDate = new Date(trip.start_date).toLocaleDateString();
      const endDate = new Date(trip.end_date).toLocaleDateString();
      return {
        output: {
          type: 'status_update',
          status: `Perfect! Dates locked in: ${startDate} - ${endDate} 📅`,
          details: `📍 ${trip.destination}\n📅 ${startDate} - ${endDate}\n\nTime to book flights! ✈️\n\nText me when you book: "BOOKED [airline] [flight number]" or just "BOOKED"`,
          sendTo: 'group',
        },
      };
    },
  },

  tracking_flights: {
    next: 'trip_confirmed',
    trigger: 'all_flights_booked',
    condition: async (trip) => {
      const flightCount = await db.getFlightCount(trip.id);
      const memberCount = await db.getMemberCount(trip.id);
      return flightCount >= memberCount;
    },
  },

  trip_confirmed: {
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
  if (!stage) return; // Invalid state

  // Special handling for planning state - check what's ready
  if (trip.stage === 'planning') {
    await checkPlanningTransitions(tripId, trip);
    return;
  }

  if (!stage.next) return; // Final state

  // Check condition
  const shouldTransition = stage.condition ? await stage.condition(trip) : true;

  if (shouldTransition) {
    const oldStage = trip.stage;
    const newStage = stage.next;

    console.log(`   🔄 State Machine: Transitioning ${oldStage} → ${newStage}`);

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

// Special function to handle flexible transitions from planning state
async function checkPlanningTransitions(tripId, trip) {
  const memberCount = await db.getMemberCount(trip.id);
  const hasDestination = !!trip.destination;
  const hasDates = !!(trip.start_date && trip.end_date);

  // If both are set, move to tracking flights
  if (hasDestination && hasDates) {
    console.log(`   🔄 State Machine: Planning complete, transitioning to tracking_flights`);
    await db.updateTrip(tripId, {
      stage: 'tracking_flights',
      stage_entered_at: new Date(),
    });
    emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'tracking_flights' });
    await checkStateTransitions(tripId);
    return;
  }

  // Check if destination suggestions are ready for voting
  const suggestionCount = await db.getDestinationSuggestionCount(trip.id);
  const allDestinationsSuggested = suggestionCount >= memberCount;
  const destinationTimeout = trip.stage_entered_at && 
    (Date.now() - new Date(trip.stage_entered_at).getTime() > 12 * 60 * 60 * 1000);

  if (!hasDestination && (allDestinationsSuggested || destinationTimeout)) {
    console.log(`   🔄 State Machine: Destination suggestions ready, transitioning to voting_destination`);
    await db.updateTrip(tripId, {
      stage: 'voting_destination',
      stage_entered_at: new Date(),
    });
    emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_destination' });
    await checkStateTransitions(tripId);
    return;
  }

  // Check if date availability is ready for voting
  const availabilityCount = await db.getDateAvailabilityCount(trip.id);
  const allDatesSubmitted = availabilityCount >= memberCount;
  const datesTimeout = trip.stage_entered_at && 
    (Date.now() - new Date(trip.stage_entered_at).getTime() > 12 * 60 * 60 * 1000);

  if (!hasDates && (allDatesSubmitted || datesTimeout)) {
    console.log(`   🔄 State Machine: Date availability ready, transitioning to voting_dates`);
    await db.updateTrip(tripId, {
      stage: 'voting_dates',
      stage_entered_at: new Date(),
    });
    emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_dates' });
    await checkStateTransitions(tripId);
    return;
  }
}

// Export STAGES so orchestrator can access actions
export { STAGES };




