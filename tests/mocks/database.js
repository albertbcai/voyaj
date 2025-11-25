// In-memory mock database for testing
import { randomUUID } from 'crypto';

export class MockDatabase {
  constructor() {
    this.trips = new Map();
    this.members = new Map();
    this.votes = new Map();
    this.flights = new Map();
    this.messages = new Map();
    this.errors = [];
  }

  // Trips
  async getTrip(tripId) {
    return this.trips.get(tripId) || null;
  }

  async getTripByInviteCode(inviteCode) {
    for (const trip of this.trips.values()) {
      if (trip.invite_code === inviteCode) return trip;
    }
    return null;
  }

  async getTripByGroupChatId(groupChatId) {
    for (const trip of this.trips.values()) {
      if (trip.group_chat_id === groupChatId) return trip;
    }
    return null;
  }

  async createTrip(data) {
    const trip = {
      id: data.id || randomUUID(),
      invite_code: data.inviteCode,
      group_chat_id: data.groupChatId,
      destination: data.destination || null,
      start_date: data.startDate || null,
      end_date: data.endDate || null,
      stage: data.stage || 'created',
      created_at: new Date(),
      updated_at: new Date(),
      stage_entered_at: data.stageEnteredAt || new Date(),
    };
    this.trips.set(trip.id, trip);
    return trip;
  }

  async updateTrip(tripId, updates) {
    const trip = this.trips.get(tripId);
    if (!trip) return null;
    
    Object.assign(trip, updates, { updated_at: new Date() });
    this.trips.set(tripId, trip);
    return trip;
  }

  // Members
  async getMemberByPhone(phoneNumber) {
    for (const member of this.members.values()) {
      if (member.phone_number === phoneNumber) return member;
    }
    return null;
  }

  async getMembers(tripId) {
    return Array.from(this.members.values()).filter(m => m.trip_id === tripId);
  }

  async getMemberCount(tripId) {
    return this.getMembers(tripId).length;
  }

  async createMember(tripId, phoneNumber, name) {
    const member = {
      id: randomUUID(),
      trip_id: tripId,
      phone_number: phoneNumber,
      name: name,
      joined_at: new Date(),
    };
    this.members.set(member.id, member);
    return member;
  }

  // Votes
  async createVote(tripId, pollType, memberId, choice) {
    // Check if member already voted
    const existing = Array.from(this.votes.values()).find(
      v => v.trip_id === tripId && v.poll_type === pollType && v.member_id === memberId
    );

    if (existing) {
      existing.choice = choice;
      existing.voted_at = new Date();
      return existing;
    }

    const vote = {
      id: randomUUID(),
      trip_id: tripId,
      poll_type: pollType,
      member_id: memberId,
      choice: choice,
      voted_at: new Date(),
    };
    this.votes.set(vote.id, vote);
    return vote;
  }

  async getVotes(tripId, pollType) {
    return Array.from(this.votes.values()).filter(
      v => v.trip_id === tripId && (!pollType || v.poll_type === pollType)
    );
  }

  async getVoteCount(tripId, pollType) {
    return this.getVotes(tripId, pollType).length;
  }

  async getVoteResults(tripId, pollType) {
    const votes = this.getVotes(tripId, pollType);
    const counts = {};
    
    for (const vote of votes) {
      counts[vote.choice] = (counts[vote.choice] || 0) + 1;
    }

    return Object.entries(counts)
      .map(([choice, count]) => ({ choice, count: count.toString() }))
      .sort((a, b) => parseInt(b.count) - parseInt(a.count));
  }

  // Flights
  async createFlight(tripId, memberId, data) {
    const flight = {
      id: randomUUID(),
      trip_id: tripId,
      member_id: memberId,
      airline: data.airline || null,
      flight_number: data.flightNumber || null,
      departure_time: data.departureTime || null,
      arrival_time: data.arrivalTime || null,
      cancelled: false,
      created_at: new Date(),
    };
    this.flights.set(flight.id, flight);
    return flight;
  }

  async getFlights(tripId) {
    const flights = Array.from(this.flights.values()).filter(f => f.trip_id === tripId);
    // Join with member names
    return flights.map(flight => {
      const member = Array.from(this.members.values()).find(m => m.id === flight.member_id);
      return {
        ...flight,
        member_name: member?.name || 'Unknown',
      };
    });
  }

  async getFlightCount(tripId) {
    return this.getFlights(tripId).filter(f => !f.cancelled).length;
  }

  async cancelFlight(tripId, memberId) {
    const flight = Array.from(this.flights.values()).find(
      f => f.trip_id === tripId && f.member_id === memberId
    );
    if (flight) {
      flight.cancelled = true;
      return flight;
    }
    return null;
  }

  // Messages
  async createMessage(tripId, fromPhone, body, groupChatId, source = 'sms') {
    const message = {
      id: randomUUID(),
      trip_id: tripId,
      from_phone: fromPhone,
      body: body,
      group_chat_id: groupChatId,
      source: source,
      received_at: new Date(),
    };
    this.messages.set(message.id, message);
    return message;
  }

  async getMessages(tripId, limit = 10) {
    return Array.from(this.messages.values())
      .filter(m => m.trip_id === tripId)
      .sort((a, b) => b.received_at - a.received_at)
      .slice(0, limit);
  }

  // Errors
  async logError(tripId, error, context) {
    this.errors.push({
      trip_id: tripId,
      error: error.message || error,
      context: context,
      timestamp: new Date(),
    });
  }

  getErrors() {
    return this.errors;
  }

  // Utility
  async reset() {
    this.trips.clear();
    this.members.clear();
    this.votes.clear();
    this.flights.clear();
    this.messages.clear();
    this.errors = [];
  }
}

export const mockDatabase = new MockDatabase();

