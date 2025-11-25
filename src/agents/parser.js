import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { callClaude } from '../utils/claude.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';

export class ParserAgent extends BaseAgent {
  async handle(context, message) {
    const { trip, member } = context;

    if (!member) {
      await twilioClient.sendSMS(message.from, 'You need to join the trip first. Reply with your name.');
      return { success: false };
    }

    // Try rule-based parsing first (cheap)
    const parsed = this.parseWithRules(message.body);

    if (parsed.confidence > 0.7) {
      return await this.handleFlight(context, parsed, member);
    }

    // Fall back to AI parsing (expensive)
    const aiParsed = await this.parseWithAI(message.body);
    return await this.handleFlight(context, aiParsed, member);
  }

  parseWithRules(text) {
    // Extract flight info with regex
    const flightPattern = /\b([A-Z]{2})\s*(\d{2,4})\b/;
    const timePattern = /(\d{1,2}):?(\d{2})?\s*(am|pm|AM|PM)?/i;

    const flightMatch = text.match(flightPattern);

    if (flightMatch) {
      const [_, airline, number] = flightMatch;
      const timeMatch = text.match(timePattern);

      return {
        confidence: 0.9,
        booked: true,
        airline: airline,
        flightNumber: number,
        time: timeMatch ? timeMatch[0] : null,
      };
    }

    // Check for "I booked" without details
    if (/\b(booked|book|flight)\b/i.test(text)) {
      return {
        confidence: 0.5,
        booked: true,
        airline: null,
        flightNumber: null,
        time: null,
      };
    }

    return { confidence: 0 };
  }

  async parseWithAI(text) {
    // Use Claude to extract flight info
    const prompt = `Extract flight information from this message: "${text}"

Return JSON only:
{
  "booked": true/false,
  "airline": "AA" or null,
  "flightNumber": "154" or null,
  "departureTime": "10:00 AM" or null,
  "arrivalTime": "2:00 PM" or null
}

Only JSON, nothing else.`;

    try {
      const response = await callClaude(prompt, { maxTokens: 150 });
      const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return { ...parsed, confidence: 0.8 };
    } catch (e) {
      console.error('Failed to parse with AI:', e);
      return { confidence: 0, booked: false };
    }
  }

  async handleFlight(context, parsed, member) {
    const { trip } = context;

    if (parsed.booked) {
      // Create flight record
      await db.createFlight(trip.id, member.id, {
        airline: parsed.airline,
        flightNumber: parsed.flightNumber,
        departureTime: parsed.departureTime ? new Date(parsed.departureTime) : null,
        arrivalTime: parsed.arrivalTime ? new Date(parsed.arrivalTime) : null,
      });

      if (parsed.airline && parsed.flightNumber) {
        await this.sendToGroup(trip.id, `${member.name} booked! ✈️ ${parsed.airline} ${parsed.flightNumber}`);
      } else if (parsed.booked) {
        // They said they booked but didn't provide details
        await this.sendToGroup(trip.id, `${member.name} booked! ✈️`);
        await twilioClient.sendSMS(member.phone_number, 'Awesome! What\'s your flight number and arrival time?');
      }

      emitEvent(EVENTS.FLIGHT_ADDED, { tripId: trip.id, memberId: member.id });

      // Check if everyone booked
      const bookedCount = await db.getFlightCount(trip.id);
      const totalMembers = context.allMembers.length;

      if (bookedCount === totalMembers) {
        await this.sendToGroup(trip.id, 'Everyone booked! 🎉 Trip is really happening!');
      }

      return { success: true };
    }

    return { success: false };
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }
}


