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
        const pollType = trip.stage === 'voting_destination' ? 'destination' : 'dates';
        return {
          currentPoll: {
            type: pollType,
            tripId,
          },
          existingVotes: await db.getVotes(tripId, pollType),
        };
      }

      case 'coordinator': {
        return {
          recentMessages: await db.getRecentMessages(tripId, 5),
        };
      }

      case 'parser': {
        return {
          flights: await db.getFlights(tripId),
        };
      }

      default:
        return {};
    }
  }
}

export const contextBuilder = new ContextBuilder();



