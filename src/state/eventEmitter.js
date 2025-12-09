import { EventEmitter } from 'events';

export const tripEvents = new EventEmitter();

// Event types
export const EVENTS = {
  MEMBER_JOINED: 'member_joined',
  DESTINATION_VOTED: 'destination_voted',
  DATES_VOTED: 'dates_voted',
  FLIGHT_ADDED: 'flight_added',
  STAGE_CHANGED: 'stage_changed',
};

// Helper to emit events
export function emitEvent(eventType, data) {
  tripEvents.emit(eventType, data);
}




