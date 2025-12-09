import * as db from '../db/queries.js';

export class ContextBuilder {
  async build(tripId, phone, intent) {
    const trip = await db.getTrip(tripId);
    if (!trip) {
      throw new Error(`Trip ${tripId} not found`);
    }

    // Layer 1: Essential trip facts (always included)
    const essential = {
      trip: {
        id: trip.id,
        stage: trip.stage,
        destination: trip.destination,
        dates: {
          start: trip.start_date,
          end: trip.end_date,
        },
      },
      member: await db.getMemberByPhoneAndTrip(tripId, phone),
      allMembers: await db.getMembers(tripId),
    };

    // Layer 2: Agent-specific context
    const agentSpecific = await this.getAgentContext(tripId, intent.agent);

    return {
      ...essential,
      ...agentSpecific,
    };
  }

  async getAgentContext(tripId, agentType) {
    switch (agentType) {
      case 'voting': {
        const trip = await db.getTrip(tripId);
        let pollType = null;
        if (trip.stage === 'voting_destination') {
          pollType = 'destination';
        } else if (trip.stage === 'voting_dates') {
          pollType = 'dates';
        }
        
        const context = {};
        
        if (pollType) {
          context.currentPoll = {
            type: pollType,
            tripId,
          };
          context.existingVotes = await db.getVotes(tripId, pollType);
        }
        
        // Add suggestion/availability context for collection phases
        if (trip.stage === 'collecting_destinations') {
          context.destinationSuggestions = await db.getDestinationSuggestions(tripId);
        } else if (trip.stage === 'voting_dates') {
          // For date voting, we need to regenerate options from availability
          const availability = await db.getDateAvailability(tripId);
          const { findOverlappingDates } = await import('../utils/dateOverlap.js');
          const options = findOverlappingDates(availability);
          context.dateOptions = options.map(opt => opt.display);
        }
        
        return context;
      }

      case 'coordinator': {
        return {
          recentMessages: await db.getRecentMessages(tripId, 5),
        };
      }

      case 'parser': {
        const trip = await db.getTrip(tripId);
        const context = {
          flights: await db.getFlights(tripId),
        };
        
        // Add date availability context for collection phase
        if (trip && (trip.stage === 'collecting_dates' || trip.stage === 'planning')) {
          context.dateAvailability = await db.getDateAvailability(tripId);
        }
        
        return context;
      }

      default:
        return {};
    }
  }
}

export const contextBuilder = new ContextBuilder();




