/**
 * Common test fixtures for agent tests
 */

/**
 * Get common test members
 */
export function getTestMembers() {
  return [
    { phone: '+15551111111', name: 'Sarah' },
    { phone: '+15552222222', name: 'Mike' },
    { phone: '+15553333333', name: 'Alex' },
  ];
}

/**
 * Get a test trip object (minimal)
 */
export function getTestTrip(overrides = {}) {
  return {
    id: 1,
    invite_code: 'test-123',
    group_chat_id: 'test-group-123',
    stage: 'created',
    destination: null,
    start_date: null,
    end_date: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

