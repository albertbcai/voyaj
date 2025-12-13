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
          details: `Time to plan! We need to figure out WHEN and WHERE.\n\nLet's start with WHEN. Share your date availability (e.g., "March 15-22" or "I'm flexible in April").\n\n🌍 You can also share destination ideas if you have them! We'll collect both and vote when we're ready.\n\nLet's start with dates, but share whatever you know first!`,
          sendTo: 'group',
        },
      };
    },
  },

  // Planning state - collects both destination suggestions and date availability simultaneously
  // Uses count-based logic to determine voting triggers and tone adjustment
  planning: {
    next: null, // Dynamic - can go to voting_destination, voting_dates, or tracking_flights
    trigger: 'check_whats_ready',
    condition: async (trip) => {
      // This state doesn't auto-transition - transitions are handled by checkPlanningTransitions
      // based on counts and what's ready (destination suggestions vs date availability)
      return false; // Never auto-transition from planning
    },
    action: async (trip, agents) => {
      // Get counts for tone adjustment
      const destinationSuggestionCount = await db.getDestinationSuggestionCount(trip.id);
      const dateAvailabilityCount = await db.getDateAvailabilityCount(trip.id);
      const memberCount = await db.getMemberCount(trip.id);
      const hasDestination = !!trip.destination;
      const hasDates = !!(trip.start_date && trip.end_date);

      // If both are set, this shouldn't happen (should transition to tracking_flights)
      // But handle gracefully
      if (hasDestination && hasDates) {
        return {
          output: {
            type: 'status_update',
            status: `Perfect! We're all set! 🎉`,
            details: `📍 ${trip.destination}\n📅 ${new Date(trip.start_date).toLocaleDateString()} - ${new Date(trip.end_date).toLocaleDateString()}\n\nTime to book flights! ✈️`,
            sendTo: 'group',
          },
        };
      }

      // Determine tone based on counts
      const destinationCountGreater = destinationSuggestionCount > dateAvailabilityCount;
      
      // Build message based on context
      let status, details;
      
      if (hasDestination) {
        // Destination already set, focus on dates
        status = `Great! We're going to ${trip.destination}! 🎉`;
        details = `Now we need dates! When are you available?\n\n📅 Reply with your date availability.\n\nExamples:\n• "March 15-22"\n• "I'm flexible in April"\n• "Late May or early June"`;
      } else if (hasDates) {
        // Dates already set, focus on destinations
        const startDate = new Date(trip.start_date).toLocaleDateString();
        const endDate = new Date(trip.end_date).toLocaleDateString();
        status = `Great! Dates locked in: ${startDate} - ${endDate} 📅`;
        details = `Now we need a destination! Where do you want to go?\n\n🌍 Share destination ideas - suggest any places that excite you! You can suggest multiple places.\n\nExamples: "Tokyo", "Bali", "Portugal", "Iceland"`;
      } else {
        // Nothing set yet - default to dates-first, adjust tone based on counts
        if (destinationCountGreater) {
          // More destination suggestions - less pushy about dates
          status = `Time to plan! We need to figure out WHEN and WHERE.`;
          details = `🌍 **Destination ideas:** ${destinationSuggestionCount > 0 ? `We have ${destinationSuggestionCount} suggestion(s) so far!` : 'Share where you\'d like to go!'} You can suggest multiple places.\n\n📅 **Date availability:** Share when you're available (e.g., "March 15-22" or "I'm flexible in April").\n\nLet's collect both - share whatever you know first!`;
        } else {
          // Default: dates-first approach
          status = `Time to plan! We need to figure out WHEN and WHERE.`;
          details = `Let's start with WHEN. Share your date availability (e.g., "March 15-22" or "I'm flexible in April").\n\n${destinationSuggestionCount > 0 ? `🌍 We also have ${destinationSuggestionCount} destination suggestion(s) - feel free to share more ideas too!` : '🌍 You can also share destination ideas if you have them!'}\n\nLet's start with dates, but share whatever you know first!`;
        }
      }

      return {
        output: {
          type: 'status_update',
          status,
          details,
          sendTo: 'group',
        },
      };
    },
  },

  voting_destination: {
    next: 'planning', // Return to planning after voting completes
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

  voting_dates: {
    next: 'planning', // Return to planning after voting completes
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

  // Handle stages with immediate trigger and action (even if next is null)
  if (stage.trigger === 'immediate' && stage.action) {
    // Check if we just entered this stage (stage_entered_at is recent, within last 5 seconds)
    const stageEnteredAt = new Date(trip.stage_entered_at || trip.created_at);
    const secondsSinceEntered = (Date.now() - stageEnteredAt.getTime()) / 1000;
    
    if (secondsSinceEntered < 5) {
      // Just entered this stage - execute the action via orchestrator
      console.log(`   🔄 State Machine: Executing immediate action for stage ${trip.stage}`);
      emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: trip.stage, to: trip.stage });
      return;
    }
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
// Uses count-based logic to determine voting triggers and tone adjustment
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

  // Get counts for count-based logic
  const destinationSuggestionCount = await db.getDestinationSuggestionCount(trip.id);
  const dateAvailabilityCount = await db.getDateAvailabilityCount(trip.id);
  
  // Check if destination suggestions are ready for voting
  const allDestinationsSuggested = destinationSuggestionCount >= memberCount;
  const destinationTimeout = trip.stage_entered_at && 
    (Date.now() - new Date(trip.stage_entered_at).getTime() > 12 * 60 * 60 * 1000);

  // Check if date availability is ready for voting
  const allDatesSubmitted = dateAvailabilityCount >= memberCount;
  const datesTimeout = trip.stage_entered_at && 
    (Date.now() - new Date(trip.stage_entered_at).getTime() > 12 * 60 * 60 * 1000);

  // Voting triggers: whichever threshold is met first
  // Default preference: dates first, but if destination threshold is met first, vote on that
  if (!hasDestination && (allDestinationsSuggested || destinationTimeout)) {
    // If both are ready, prefer dates (default), but if destination is ready and dates aren't, vote on destination
    if (!hasDates && allDatesSubmitted && !allDestinationsSuggested && !destinationTimeout) {
      // Dates ready, destination not ready - vote on dates (default preference)
      console.log(`   🔄 State Machine: Date availability ready, transitioning to voting_dates`);
      await db.updateTrip(tripId, {
        stage: 'voting_dates',
        stage_entered_at: new Date(),
      });
      emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_dates' });
      await checkStateTransitions(tripId);
      return;
    } else {
      // Destination ready (or timeout) - vote on destination
      console.log(`   🔄 State Machine: Destination suggestions ready, transitioning to voting_destination`);
      await db.updateTrip(tripId, {
        stage: 'voting_destination',
        stage_entered_at: new Date(),
      });
      emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_destination' });
      await checkStateTransitions(tripId);
      return;
    }
  }

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

  // If timeout and both have suggestions, vote on whichever has more
  if (destinationTimeout && datesTimeout && !hasDestination && !hasDates) {
    if (destinationSuggestionCount >= dateAvailabilityCount) {
      console.log(`   🔄 State Machine: Timeout - more destination suggestions, transitioning to voting_destination`);
      await db.updateTrip(tripId, {
        stage: 'voting_destination',
        stage_entered_at: new Date(),
      });
      emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_destination' });
      await checkStateTransitions(tripId);
      return;
    } else {
      console.log(`   🔄 State Machine: Timeout - more date availability, transitioning to voting_dates`);
      await db.updateTrip(tripId, {
        stage: 'voting_dates',
        stage_entered_at: new Date(),
      });
      emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: 'planning', to: 'voting_dates' });
      await checkStateTransitions(tripId);
      return;
    }
  }
}

// Centralized function to request state transitions
// All state changes should go through this function
export async function requestStateTransition(tripId, newStage, reason = '') {
  const trip = await db.getTrip(tripId);
  if (!trip) {
    console.warn(`   ⚠️  State Machine: Trip ${tripId} not found for transition`);
    return false;
  }

  const oldStage = trip.stage;
  
  // Validate that the transition is valid
  const stage = STAGES[newStage];
  if (!stage) {
    console.warn(`   ⚠️  State Machine: Invalid stage ${newStage} requested`);
    return false;
  }

  // Don't transition if already in that stage
  if (oldStage === newStage) {
    console.log(`   🔄 State Machine: Already in stage ${newStage}, skipping transition`);
    return false;
  }

  console.log(`   🔄 State Machine: Requesting transition ${oldStage} → ${newStage}${reason ? ` (${reason})` : ''}`);

  // Update stage
  await db.updateTrip(tripId, {
    stage: newStage,
    stage_entered_at: new Date(),
  });

  // Emit event
  emitEvent(EVENTS.STAGE_CHANGED, { tripId, from: oldStage, to: newStage });

  // Check if next stage immediately transitions
  await checkStateTransitions(tripId);

  return true;
}

// Export STAGES so orchestrator can access actions
export { STAGES };




