// Test data fixtures
export const sampleTrips = {
  newTrip: {
    inviteCode: 'ABC123',
    groupChatId: 'group_123',
    stage: 'created',
  },
  tripWithMembers: {
    inviteCode: 'XYZ789',
    groupChatId: 'group_456',
    stage: 'collecting_members',
  },
  tripVotingDestination: {
    inviteCode: 'DEF456',
    groupChatId: 'group_789',
    stage: 'voting_destination',
    destination: null,
  },
  tripVotingDates: {
    inviteCode: 'GHI789',
    groupChatId: 'group_101',
    stage: 'voting_dates',
    destination: 'Tokyo',
  },
  tripPlanning: {
    inviteCode: 'JKL012',
    groupChatId: 'group_202',
    stage: 'planning',
    destination: 'Tokyo',
    startDate: new Date('2024-03-15'),
    endDate: new Date('2024-03-22'),
  },
};

export const sampleMembers = {
  sarah: {
    phoneNumber: '+15551111111',
    name: 'Sarah',
  },
  mike: {
    phoneNumber: '+15552222222',
    name: 'Mike',
  },
  alex: {
    phoneNumber: '+15553333333',
    name: 'Alex',
  },
  jess: {
    phoneNumber: '+15554444444',
    name: 'Jess',
  },
};

export const sampleVotes = {
  tokyo: 'Tokyo',
  bali: 'Bali',
  seoul: 'Seoul',
  march15_22: 'March 15-22',
  april5_12: 'April 5-12',
};

export const sampleFlights = {
  aa154: {
    airline: 'AA',
    flightNumber: '154',
    arrivalTime: '2024-03-15T14:00:00Z',
  },
  ua456: {
    airline: 'UA',
    flightNumber: '456',
    arrivalTime: '2024-03-15T16:00:00Z',
  },
  dl789: {
    airline: 'DL',
    flightNumber: '789',
    arrivalTime: '2024-03-15T18:00:00Z',
  },
};



