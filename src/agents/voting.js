import { BaseAgent } from './base.js';
import * as db from '../db/queries.js';
import { twilioClient } from '../utils/twilio.js';
import { emitEvent, EVENTS } from '../state/eventEmitter.js';
import { checkStateTransitions } from '../state/stateMachine.js';
import { parseDateRange } from '../utils/helpers.js';

export class VotingAgent extends BaseAgent {
  async handle(context, message) {
    const { trip, member, currentPoll, existingVotes } = context;

    if (!member) {
      await twilioClient.sendSMS(message.from, 'You need to join the trip first. Reply with your name.');
      return { success: false };
    }

    const choice = message.body.trim();
    
    // Skip very short or obviously non-vote messages
    if (choice.length < 2 || choice.toLowerCase() === 'ok' || choice.toLowerCase() === 'sounds good' || 
        choice.toLowerCase() === 'excited' || choice.toLowerCase() === 'me too') {
      // This is probably casual conversation, not a vote
      return { success: false, skip: true };
    }

    // Record vote
    await db.createVote(trip.id, currentPoll.type, member.id, choice);

    // Check if member already voted
    const alreadyVoted = existingVotes.some(v => v.member_id === member.id);

    if (alreadyVoted) {
      await twilioClient.sendSMS(message.from, `Updated your vote to: ${choice} ✓`);
    } else {
      await twilioClient.sendSMS(message.from, `Got it! Voted for: ${choice} ✓`);
    }

    // Check if poll should close
    const totalMembers = context.allMembers.length;
    const totalVotes = await db.getVoteCount(trip.id, currentPoll.type);

    const majorityVoted = totalVotes >= Math.ceil(totalMembers * 0.6);

    if (majorityVoted) {
      return await this.closePoll(context);
    }

    // Show status
    const pendingVoters = this.getPendingVoters(context, existingVotes);
    await this.sendToGroup(trip.id, `${totalVotes}/${totalMembers} voted. Still waiting on: ${pendingVoters}`);

    emitEvent(EVENTS.DESTINATION_VOTED, { tripId: trip.id, pollType: currentPoll.type });

    return { success: true };
  }

  async closePoll(context) {
    const { trip, currentPoll } = context;

    // Tally votes
    const results = await db.getVoteResults(trip.id, currentPoll.type);

    if (results.length === 0) {
      return { success: false, error: 'No votes recorded' };
    }

    // Get winner (most votes)
    const winner = results[0].choice;
    const voteCount = parseInt(results[0].count, 10);

    // Update trip
    if (currentPoll.type === 'destination') {
      await db.updateTrip(trip.id, {
        destination: winner,
        stage: 'destination_set',
        stage_entered_at: new Date(),
      });

      await this.sendToGroup(trip.id, `${winner} wins with ${voteCount} votes! 🎉\n\nNow let's pick dates. When can everyone go?`);

      // Transition to date voting
      await db.updateTrip(trip.id, { stage: 'voting_dates', stage_entered_at: new Date() });

      emitEvent(EVENTS.STAGE_CHANGED, { tripId: trip.id, from: 'voting_destination', to: 'destination_set' });
    } else if (currentPoll.type === 'dates') {
      // Parse date from winner choice
      const dates = parseDateRange(winner);

      if (dates.start && dates.end) {
        await db.updateTrip(trip.id, {
          start_date: dates.start,
          end_date: dates.end,
          stage: 'dates_set',
          stage_entered_at: new Date(),
        });

        await this.sendToGroup(trip.id, `${winner} locked in! ✓\n\nText me when you book your flights. ✈️`);

        // Transition to planning
        await db.updateTrip(trip.id, { stage: 'planning', stage_entered_at: new Date() });

        emitEvent(EVENTS.STAGE_CHANGED, { tripId: trip.id, from: 'voting_dates', to: 'dates_set' });
      } else {
        await this.sendToGroup(trip.id, `Couldn't parse dates from "${winner}". Please try again with format like "March 15-22".`);
        return { success: false };
      }
    }

    await checkStateTransitions(trip.id);

    return { success: true, poll_closed: true };
  }

  getPendingVoters(context, existingVotes) {
    const voted = new Set(existingVotes.map(v => v.member_id));
    const pending = context.allMembers
      .filter(m => !voted.has(m.id))
      .map(m => m.name);

    return pending.length > 0 ? pending.join(', ') : 'everyone';
  }

  async sendToGroup(tripId, message) {
    const members = await db.getMembers(tripId);
    for (const member of members) {
      await twilioClient.sendSMS(member.phone_number, message);
    }
  }
}


