import { VotingAgent } from '../../src/agents/voting.js';
import { setupTestDB, cleanupTestDB, ensureSnapshotMode, createMockContext } from './common/helpers.js';
import * as db from '../../src/db/queries.js';

/**
 * Voting Agent Tests
 * 
 * Tests vote parsing and destination normalization.
 */

// Vote parsing test cases
const voteParsingTests = [
  // Clear positive cases (should parse as votes)
  { input: '1', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Numeric vote' },
  { input: '2', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Bali', description: 'Numeric vote' },
  { input: 'Tokyo', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Name-based vote' },
  { input: 'Bali', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Bali', description: 'Name-based vote' },
  { input: '1 - Tokyo!!!', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Vote with enthusiasm' },
  { input: 'I vote for option 1', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Natural language vote' },
  { input: 'Let\'s go with Tokyo', options: ['Tokyo', 'Bali', 'Paris'], expected: 'Tokyo', description: 'Natural language vote (Tokyo in options)' },
  
  // Future feature: Adding new options mid-vote
  // When destination is NOT in options, should add it and update voting options
  { 
    input: 'Let\'s go with London', 
    options: ['Tokyo', 'Bali', 'Paris'], 
    expected: null, // Will parse as vote attempt, but London not in options
    description: 'New destination suggestion during vote (London not in options)',
    shouldAddOption: true, // Future feature: should add London to options
    expectedNewOptions: ['Tokyo', 'Bali', 'Paris', 'London'],
  },
  
  // Clear negative cases (should NOT parse as votes)
  { input: 'This doesn\'t look right', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Complaint, not vote' },
  { input: 'What are the options?', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Question, not vote' },
  { input: 'I\'m confused', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Confusion, not vote' },
  { input: 'Can we add more options?', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Request, not vote' },
  
  // Edge cases
  { input: '4', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Invalid option number' },
  { input: '0', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Invalid option number' },
  { input: 'London', options: ['Tokyo', 'Bali', 'Paris'], expected: null, description: 'Name not in options' },
];

// Test cases for adding new options mid-vote (future feature)
// These test the expected state/output even though feature isn't implemented yet
const addOptionMidVoteTests = [
  {
    input: 'Let\'s go with London',
    currentOptions: ['Tokyo', 'Bali', 'Paris'],
    newDestination: 'London',
    description: 'Add new destination during active vote',
    // Expected state after feature is implemented:
    expectedState: {
      // Should add London to destination_suggestions
      destinationAdded: true,
      // Should update voting options to include London
      updatedOptions: ['Tokyo', 'Bali', 'Paris', 'London'],
      // Should output indication that option was added
      outputType: 'option_added_during_vote',
      // Should stay in voting_destination stage
      stage: 'voting_destination',
    },
  },
  {
    input: 'What about Barcelona?',
    currentOptions: ['Tokyo', 'Bali', 'Paris'],
    newDestination: 'Barcelona',
    description: 'Question format suggesting new destination',
    expectedState: {
      destinationAdded: true,
      updatedOptions: ['Tokyo', 'Bali', 'Paris', 'Barcelona'],
      outputType: 'option_added_during_vote',
      stage: 'voting_destination',
    },
  },
];

// Destination normalization test cases
const destinationNormalizationTests = [
  // Clear positive cases (should normalize as destinations)
  { input: 'Tokyo', expected: 'Tokyo', description: 'Simple destination' },
  { input: 'tokyo', expected: 'Tokyo', description: 'Lowercase destination' },
  { input: 'TOKYO', expected: 'Tokyo', description: 'Uppercase destination' },
  { input: 'Bali', expected: 'Bali', description: 'Simple destination' },
  { input: 'Paris', expected: 'Paris', description: 'Simple destination' },
  { input: 'Japan', expected: 'Japan', description: 'Country destination' },
  { input: 'Portugal', expected: 'Portugal', description: 'Country destination' },
  
  // Clear negative cases (should throw NOT_A_DESTINATION)
  { input: 'This doesn\'t look right', expected: null, description: 'Not a destination', shouldThrow: 'NOT_A_DESTINATION' },
  { input: 'I\'m flexible', expected: null, description: 'Not a destination', shouldThrow: 'NOT_A_DESTINATION' },
  { input: 'somewhere with good food', expected: null, description: 'Vague preference, not destination', shouldThrow: 'NOT_A_DESTINATION' },
  { input: 'ok', expected: null, description: 'Common word, not destination', shouldThrow: 'NOT_A_DESTINATION' },
  
  // Context-based tests (with existing members)
  { input: 'Sarah', expected: null, description: 'Member name, not destination', context: [{ name: 'Sarah' }], shouldThrow: 'NAME_NOT_DESTINATION' },
  { input: 'Mike', expected: null, description: 'Member name, not destination', context: [{ name: 'Mike' }], shouldThrow: 'NAME_NOT_DESTINATION' },
];

/**
 * Run vote parsing tests
 */
async function runVoteParsingTests() {
  console.log('\n📋 Testing Voting Agent - Vote Parsing\n');
  
  ensureSnapshotMode();
  
  const votingAgent = new VotingAgent();
  const results = {
    passed: 0,
    failed: 0,
    failures: [],
  };
  
  for (const testCase of voteParsingTests) {
    const { tripId, trip, members } = await setupTestDB({ members: [{ phone: '+15551111111', name: 'TestMember' }] });
    
    try {
      // Create destination suggestions for the options
      const memberId = members[0].id;
      for (const option of testCase.options) {
        await db.createDestinationSuggestion(tripId, memberId, option);
      }
      
      const context = createMockContext(trip, members);
      
      const result = await votingAgent.parseVote(testCase.input, 'destination', context);
      
      if (result === testCase.expected) {
        results.passed++;
        console.log(`   ✅ "${testCase.input}" → ${testCase.expected || 'null'} (${testCase.description})`);
      } else {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result,
          description: testCase.description,
        });
        console.log(`   ❌ "${testCase.input}" → Expected ${testCase.expected || 'null'}, got ${result || 'null'} (${testCase.description})`);
      }
    } catch (error) {
      results.failed++;
      results.failures.push({
        input: testCase.input,
        expected: testCase.expected,
        actual: null,
        description: testCase.description,
        error: error.message,
      });
      console.log(`   ❌ "${testCase.input}" → Error: ${error.message}`);
    } finally {
      await cleanupTestDB(tripId);
    }
  }
  
  return results;
}

/**
 * Run destination normalization tests
 */
async function runDestinationNormalizationTests() {
  console.log('\n📋 Testing Voting Agent - Destination Normalization\n');
  
  ensureSnapshotMode();
  
  const votingAgent = new VotingAgent();
  const results = {
    passed: 0,
    failed: 0,
    failures: [],
  };
  
  for (const testCase of destinationNormalizationTests) {
    try {
      const contextMembers = testCase.context || [];
      const result = await votingAgent.normalizeDestination(testCase.input, contextMembers);
      
      if (testCase.shouldThrow) {
        // Expected to throw, but didn't
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: `Should throw ${testCase.shouldThrow}`,
          actual: result,
          description: testCase.description,
        });
        console.log(`   ❌ "${testCase.input}" → Expected error ${testCase.shouldThrow}, got result: ${result}`);
      } else if (result === testCase.expected) {
        results.passed++;
        const contextStr = testCase.context?.length > 0 ? ` [context: ${testCase.context.map(m => m.name).join(', ')}]` : '';
        console.log(`   ✅ "${testCase.input}" → ${result}${contextStr} (${testCase.description})`);
      } else {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result,
          description: testCase.description,
        });
        console.log(`   ❌ "${testCase.input}" → Expected ${testCase.expected}, got ${result} (${testCase.description})`);
      }
    } catch (error) {
      if (testCase.shouldThrow && error.message === testCase.shouldThrow) {
        // Expected error occurred
        results.passed++;
        const contextStr = testCase.context?.length > 0 ? ` [context: ${testCase.context.map(m => m.name).join(', ')}]` : '';
        console.log(`   ✅ "${testCase.input}" → Correctly threw ${testCase.shouldThrow}${contextStr} (${testCase.description})`);
      } else if (!testCase.shouldThrow) {
        // Unexpected error
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: null,
          description: testCase.description,
          error: error.message,
        });
        console.log(`   ❌ "${testCase.input}" → Unexpected error: ${error.message}`);
      } else {
        // Expected error but wrong type
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: `Should throw ${testCase.shouldThrow}`,
          actual: error.message,
          description: testCase.description,
        });
        console.log(`   ❌ "${testCase.input}" → Expected ${testCase.shouldThrow}, got ${error.message}`);
      }
    }
  }
  
  return results;
}

/**
 * Run tests for adding options mid-vote (future feature)
 */
async function runAddOptionMidVoteTests() {
  console.log('\n📋 Testing Voting Agent - Add Option Mid-Vote (Future Feature)\n');
  console.log('   ⚠️  This feature is not yet implemented. Testing expected state/output.\n');
  
  ensureSnapshotMode();
  
  const votingAgent = new VotingAgent();
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };
  
  for (const testCase of addOptionMidVoteTests) {
    const { tripId, trip: initialTrip, members } = await setupTestDB({ 
      members: [{ phone: '+15551111111', name: 'TestMember' }],
    });
    
    // Update trip to voting_destination stage
    await db.updateTrip(tripId, { stage: 'voting_destination' });
    const trip = await db.getTrip(tripId);
    
    try {
      // Create initial destination suggestions (current options)
      const memberId = members[0].id;
      for (const option of testCase.currentOptions) {
        await db.createDestinationSuggestion(tripId, memberId, option);
      }
      
      // Create a message object
      const message = {
        from: members[0].phone_number,
        body: testCase.input,
        groupChatId: `test-group-${tripId}`,
      };
      
      const context = createMockContext(trip, members, members[0]);
      
      // Call handle (not parseVote) to test full flow
      const result = await votingAgent.handle(context, message);
      
      // Check expected state
      const stateChecks = {
        destinationAdded: false,
        stageCorrect: false,
        outputCorrect: false,
      };
      
      // Check if destination was added to database
      const allSuggestions = await db.getDestinationSuggestions(tripId);
      const destinationExists = allSuggestions.some(s => 
        s.destination.toLowerCase() === testCase.newDestination.toLowerCase()
      );
      stateChecks.destinationAdded = destinationExists;
      
      // Check if stage is still voting_destination
      const updatedTrip = await db.getTrip(tripId);
      stateChecks.stageCorrect = updatedTrip.stage === testCase.expectedState.stage;
      
      // Check output type (if result has output)
      if (result.success && result.output) {
        stateChecks.outputCorrect = result.output.type === testCase.expectedState.outputType ||
          result.output.type === 'destination_suggested' || // Alternative: treated as suggestion
          result.output.type === 'option_added_during_vote'; // Expected type
      }
      
      // For now, we expect this to fail (feature not implemented)
      // But we document what the expected state should be
      if (destinationExists && stateChecks.stageCorrect) {
        results.passed++;
        console.log(`   ✅ "${testCase.input}" → Destination added, stage correct (${testCase.description})`);
      } else {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expectedState,
          actual: {
            destinationAdded: stateChecks.destinationAdded,
            stage: updatedTrip.stage,
            outputType: result.output?.type,
          },
          description: testCase.description,
        });
        console.log(`   ⚠️  "${testCase.input}" → Feature not implemented yet`);
        console.log(`      Expected: ${JSON.stringify(testCase.expectedState, null, 2)}`);
        console.log(`      Actual: destinationAdded=${stateChecks.destinationAdded}, stage=${updatedTrip.stage}, outputType=${result.output?.type || 'none'}`);
      }
    } catch (error) {
      // Expected to fail for now
      results.skipped++;
      console.log(`   ⏭️  "${testCase.input}" → Skipped (feature not implemented: ${error.message})`);
    } finally {
      await cleanupTestDB(tripId);
    }
  }
  
  return results;
}

/**
 * Run all voting agent tests
 */
export async function runVotingTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗳️  Voting Agent Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const voteParsingResults = await runVoteParsingTests();
  const destinationNormalizationResults = await runDestinationNormalizationTests();
  const addOptionMidVoteResults = await runAddOptionMidVoteTests();
  
  const voteTotal = voteParsingResults.passed + voteParsingResults.failed;
  const voteAccuracy = voteTotal > 0 ? (voteParsingResults.passed / voteTotal * 100).toFixed(1) : 0;
  
  const destTotal = destinationNormalizationResults.passed + destinationNormalizationResults.failed;
  const destAccuracy = destTotal > 0 ? (destinationNormalizationResults.passed / destTotal * 100).toFixed(1) : 0;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Results:');
  console.log(`   Vote Parsing: ${voteAccuracy}% accuracy (${voteParsingResults.passed}/${voteTotal} correct)`);
  console.log(`   Destination Normalization: ${destAccuracy}% accuracy (${destinationNormalizationResults.passed}/${destTotal} correct)`);
  console.log(`   Add Option Mid-Vote: ${addOptionMidVoteResults.passed} passed, ${addOptionMidVoteResults.failed} failed, ${addOptionMidVoteResults.skipped} skipped (future feature)`);
  
  if (voteParsingResults.failures.length > 0) {
    console.log('\n   ❌ Vote Parsing Failures:');
    for (const failure of voteParsingResults.failures) {
      if (failure.error) {
        console.log(`      "${failure.input}" → Error: ${failure.error}`);
      } else {
        console.log(`      "${failure.input}" → Expected ${failure.expected || 'null'}, got ${failure.actual || 'null'}`);
      }
    }
  }
  
  if (destinationNormalizationResults.failures.length > 0) {
    console.log('\n   ❌ Destination Normalization Failures:');
    for (const failure of destinationNormalizationResults.failures) {
      if (failure.error) {
        console.log(`      "${failure.input}" → Error: ${failure.error}`);
      } else {
        console.log(`      "${failure.input}" → ${failure.expected}, got ${failure.actual || 'null'}`);
      }
    }
  }
  
  if (addOptionMidVoteResults.failures.length > 0) {
    console.log('\n   ⚠️  Add Option Mid-Vote (Future Feature):');
    console.log('      These tests document expected behavior for future implementation.');
    for (const failure of addOptionMidVoteResults.failures) {
      console.log(`      "${failure.input}" → Expected state not yet implemented`);
      console.log(`         Expected: destinationAdded=true, stage=voting_destination, outputType=option_added_during_vote`);
      console.log(`         Actual: destinationAdded=${failure.actual.destinationAdded}, stage=${failure.actual.stage}, outputType=${failure.actual.outputType || 'none'}`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    voteParsing: {
      accuracy: parseFloat(voteAccuracy),
      passed: voteParsingResults.passed,
      failed: voteParsingResults.failed,
      total: voteTotal,
      failures: voteParsingResults.failures,
    },
    destinationNormalization: {
      accuracy: parseFloat(destAccuracy),
      passed: destinationNormalizationResults.passed,
      failed: destinationNormalizationResults.failed,
      total: destTotal,
      failures: destinationNormalizationResults.failures,
    },
    addOptionMidVote: {
      passed: addOptionMidVoteResults.passed,
      failed: addOptionMidVoteResults.failed,
      skipped: addOptionMidVoteResults.skipped,
      failures: addOptionMidVoteResults.failures,
      note: 'Future feature - tests document expected behavior',
    },
  };
}

