import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { callClaudeWithSystemPrompt } from '../utils/claude.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';
import { checkStateTransitions } from '../state/stateMachine.js';

export class CoordinatorAgent extends BaseAgent {
  async handle(context, message) {
    const { trip, member } = context;

    // Handle based on trip stage
    switch (trip.stage) {
      case 'created':
        return await this.handleFirstMember(context, message);

      case 'collecting_members':
        return await this.handleMemberJoin(context, message);

      case 'voting_destination':
      case 'voting_dates':
        // Hand off to voting agent
        return { handoff: 'voting' };

      case 'planning':
      case 'destination_set':
      case 'dates_set':
        return await this.handlePlanning(context, message);

      default:
        return await this.handleGeneral(context, message);
    }
  }

  async handleFirstMember(context, message) {
    const { trip } = context;

    // Update to collecting_members stage
    await db.updateTrip(trip.id, { stage: 'collecting_members', stage_entered_at: new Date() });

    await this.sendToGroup(trip.id, 'Hey! New trip 🎉\n\nEveryone reply with your name to join.');

    return { success: true };
  }

  async handleMemberJoin(context, message) {
    const { trip } = context;
    const name = message.body.trim();

    // Check if already a member
    if (context.member) {
      // Already joined, this might be a different message
      // But if it's a short name-like message, they might be trying to join again
      if (message.body.trim().length < 30 && !message.body.includes(' ')) {
        await twilioClient.sendSMS(message.from, `You're already in this trip as ${context.member.name}! What can I help with?`);
        return { success: true };
      }
      return await this.handleGeneral(context, message);
    }

    // Add as member
    const member = await db.createMember(trip.id, message.from, name);

    const memberCount = await db.getMemberCount(trip.id);

    await this.sendToGroup(trip.id, `Welcome ${name}! 🎉 ${memberCount} people in the trip.`);

    emitEvent(EVENTS.MEMBER_JOINED, { tripId: trip.id, memberId: member.id, name });

    // If enough people, move to voting
    if (memberCount >= 3) {
      await this.startDestinationVoting(trip);
    }

    return { success: true };
  }

  async startDestinationVoting(trip) {
    await db.updateTrip(trip.id, { stage: 'voting_destination', stage_entered_at: new Date() });

    await this.sendToGroup(trip.id, 'Got enough people! Let\'s plan.\n\nWhere should we go? Drop destination ideas!');

    await checkStateTransitions(trip.id);
  }

  async handlePlanning(context, message) {
    const body = message.body.toLowerCase();

    if ((body.includes('who') && body.includes('book')) || body.includes('flight')) {
      return await this.showFlightStatus(context);
    }

    if (body.includes('plan') || body.includes('itinerary')) {
      return await this.showItinerary(context);
    }

    // General response with context
    return await this.handleGeneral(context, message);
  }

  async showFlightStatus(context) {
    const { trip, allMembers } = context;
    const flights = await db.getFlights(trip.id);
    const bookedCount = flights.length;
    const totalMembers = allMembers.length;

    if (flights.length === 0) {
      await this.sendToGroup(trip.id, 'No flights booked yet. Text me when you book! ✈️');
    } else {
      const flightList = flights.map(f => `${f.member_name}: ${f.airline || ''} ${f.flight_number || ''}`).join('\n');
      await this.sendToGroup(trip.id, `${bookedCount}/${totalMembers} people booked:\n${flightList}`);
    }

    return { success: true };
  }

  async showItinerary(context) {
    const { trip } = context;
    await this.sendToGroup(trip.id, 'Itinerary feature coming soon! For now, let\'s focus on getting flights booked. ✈️');
    return { success: true };
  }

  async handleGeneral(context, message) {
    // Use Claude for natural response
    const systemPrompt = `You are Voyaj, a friendly trip coordinator. Keep responses to 1-2 sentences. Be warm and concise.`;
    
    const userPrompt = `Trip: ${context.trip.destination || 'Planning'} (${context.trip.stage})
Members: ${context.allMembers.map(m => m.name).join(', ')}

User message: "${message.body}"

Respond helpfully.`;

    try {
      const response = await callClaudeWithSystemPrompt(systemPrompt, userPrompt, { maxTokens: 100 });
      await twilioClient.sendSMS(message.from, response);
      return { success: true };
    } catch (error) {
      // Only log non-retryable errors (retryable errors are already handled in claude.js)
      if (error.status !== 529 && error.status !== 500 && error.status !== 503) {
        console.error('Error in coordinator agent:', error.message);
      }
      await twilioClient.sendSMS(message.from, "I didn't quite catch that. Can you rephrase?");
      return { success: false, error: error.message };
    }
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }
}

