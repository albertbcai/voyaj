import { ResponderAgent } from '../../src/agents/responder.js';
import { setupTestDB, cleanupTestDB, ensureSnapshotMode, createMockContext, createMockMessage } from './common/helpers.js';
import * as db from '../../src/db/queries.js';

/**
 * Responder Agent Tests
 * 
 * Tests AI response quality when acknowledging destination suggestions in different contexts.
 */

/**
 * Test 1: First Destination Suggestion (Empty Context)
 * Tests that responder acknowledges the first destination suggestion enthusiastically
 * and encourages others to share their ideas.
 */
async function runFirstDestinationTest() {
  console.log('\n📋 Testing Responder Agent - First Destination Suggestion\n');
  
  ensureSnapshotMode();
  
  const responder = new ResponderAgent();
  const results = {
    passed: 0,
    failed: 0,
    failures: [],
    testResults: [], // Store all test results including passed ones
  };
  
  const { tripId, trip, members } = await setupTestDB({
    members: [
      { phone: '+15551111111', name: 'Alex' },
      { phone: '+15552222222', name: 'Jordan' },
      { phone: '+15553333333', name: 'Sam' },
    ],
    stage: 'collecting_destinations',
  });
  
  try {
    // Create mock agent output for first destination suggestion
    const agentOutput = {
      type: 'destination_suggested',
      memberName: 'Alex',
      destinations: ['Costa Rica'],
      savedCount: 1,
      alreadySuggested: false,
      suggestionCount: 1,
      memberCount: 3,
      pendingMembers: ['Jordan', 'Sam'],
      limitReached: false,
      limitMessage: null,
      sendTo: 'group',
    };
    
    const message = createMockMessage(members[0].phone_number, 'Costa Rica');
    const context = createMockContext(trip, members, members[0]);
    
    console.log(`\n   📝 Test Context:`);
    console.log(`      Trip Stage: ${trip.stage}`);
    console.log(`      Members: ${members.map(m => m.name).join(', ')}`);
    console.log(`      Agent Output: ${JSON.stringify(agentOutput, null, 2)}`);
    console.log(`      User Message: "${message.body}"`);
    
    // Call formatResponse
    const result = await responder.formatResponse(agentOutput, context, message);
    
    console.log(`\n   📨 Response Result:`);
    console.log(`      Message: ${result.message ? `"${result.message}"` : 'null'}`);
    console.log(`      Send To: ${result.sendTo || 'N/A'}`);
    console.log(`      Reasoning: ${result.reasoning || 'N/A'}`);
    
    // Verify response quality
    const checks = {
      hasMessage: !!result.message,
      acknowledgesSuggestion: false,
      mentionsMemberName: false,
      mentionsDestination: false,
      showsProgress: false,
      encouragesOthers: false,
      hasEnthusiasm: false,
    };
    
    if (result.message) {
      const msg = result.message.toLowerCase();
      checks.acknowledgesSuggestion = 
        msg.includes('costa rica') || 
        msg.includes('destination') || 
        msg.includes('suggested');
      checks.mentionsMemberName = msg.includes('alex');
      checks.mentionsDestination = msg.includes('costa rica');
      checks.showsProgress = 
        msg.includes('1') || 
        msg.includes('one') || 
        msg.includes('first');
      checks.encouragesOthers = 
        msg.includes('share') || 
        msg.includes('everyone') || 
        msg.includes('others') ||
        msg.includes('ideas');
      checks.hasEnthusiasm = 
        msg.includes('🎉') || 
        msg.includes('awesome') || 
        msg.includes('great') ||
        msg.includes('excited');
    }
    
    // Check if all quality criteria are met
    const allChecksPass = 
      checks.hasMessage &&
      checks.acknowledgesSuggestion &&
      checks.mentionsDestination &&
      checks.showsProgress &&
      checks.encouragesOthers;
    
    console.log(`\n   ✅ Quality Checks:`);
    console.log(`      Has Message: ${checks.hasMessage ? '✅' : '❌'}`);
    console.log(`      Acknowledges Suggestion: ${checks.acknowledgesSuggestion ? '✅' : '❌'}`);
    console.log(`      Mentions Member Name: ${checks.mentionsMemberName ? '✅' : '❌'}`);
    console.log(`      Mentions Destination: ${checks.mentionsDestination ? '✅' : '❌'}`);
    console.log(`      Shows Progress: ${checks.showsProgress ? '✅' : '❌'}`);
    console.log(`      Encourages Others: ${checks.encouragesOthers ? '✅' : '❌'}`);
    console.log(`      Has Enthusiasm: ${checks.hasEnthusiasm ? '✅' : '❌'}`);
    
    // Store test result (both passed and failed)
    const testResult = {
      test: 'First destination suggestion',
      passed: allChecksPass,
      checks,
      message: result.message,
      sendTo: result.sendTo,
      reasoning: result.reasoning,
      agentOutput,
      description: 'Response should acknowledge, show progress, and encourage others',
    };
    if (!results.testResults) {
      results.testResults = [];
    }
    results.testResults.push(testResult);
    
    if (allChecksPass) {
      results.passed++;
      console.log(`\n   ✅ First destination suggestion → Response quality: PASS`);
    } else {
      results.failed++;
      results.failures.push(testResult);
      console.log(`\n   ❌ First destination suggestion → Response quality: FAIL`);
    }
  } catch (error) {
    results.failed++;
    results.failures.push({
      test: 'First destination suggestion',
      error: error.message,
    });
    console.log(`   ❌ First destination suggestion → Error: ${error.message}`);
  } finally {
    await cleanupTestDB(tripId);
  }
  
  return results;
}

/**
 * Test 2: Subsequent Destination Suggestion (With Existing Context)
 * Tests that responder acknowledges new suggestions and lists all current destinations.
 */
async function runSubsequentDestinationTest() {
  console.log('\n📋 Testing Responder Agent - Subsequent Destination Suggestion\n');
  
  ensureSnapshotMode();
  
  const responder = new ResponderAgent();
  const results = {
    passed: 0,
    failed: 0,
    failures: [],
  };
  
  const { tripId, trip, members } = await setupTestDB({
    members: [
      { phone: '+15551111111', name: 'Alex' },
      { phone: '+15552222222', name: 'Jordan' },
      { phone: '+15553333333', name: 'Sam' },
      { phone: '+15554444444', name: 'Taylor' },
    ],
    stage: 'collecting_destinations',
  });
  
  try {
    // Create existing destination suggestions (Alex and Jordan already suggested)
    await db.createDestinationSuggestion(tripId, members[0].id, 'Costa Rica');
    await db.createDestinationSuggestion(tripId, members[1].id, 'Iceland');
    
    // Create mock agent output for subsequent destination suggestion
    const agentOutput = {
      type: 'destination_suggested',
      memberName: 'Sam',
      destinations: ['Tokyo'],
      savedCount: 1,
      alreadySuggested: false,
      suggestionCount: 3, // Now 3 total (Costa Rica, Iceland, Tokyo)
      memberCount: 4,
      pendingMembers: ['Taylor'],
      limitReached: false,
      limitMessage: null,
      sendTo: 'group',
    };
    
    const message = createMockMessage(members[2].phone_number, 'Tokyo');
    const context = createMockContext(trip, members, members[2]);
    
    console.log(`\n   📝 Test Context:`);
    console.log(`      Trip Stage: ${trip.stage}`);
    console.log(`      Members: ${members.map(m => m.name).join(', ')}`);
    console.log(`      Existing Suggestions: Costa Rica (Alex), Iceland (Jordan)`);
    console.log(`      Agent Output: ${JSON.stringify(agentOutput, null, 2)}`);
    console.log(`      User Message: "${message.body}"`);
    
    // Call formatResponse
    const result = await responder.formatResponse(agentOutput, context, message);
    
    console.log(`\n   📨 Response Result:`);
    console.log(`      Message: ${result.message ? `"${result.message}"` : 'null'}`);
    console.log(`      Send To: ${result.sendTo || 'N/A'}`);
    console.log(`      Reasoning: ${result.reasoning || 'N/A'}`);
    
    // Verify response quality
    const checks = {
      hasMessage: !!result.message,
      acknowledgesSuggestion: false,
      mentionsMemberName: false,
      mentionsNewDestination: false,
      listsAllDestinations: false,
      showsUpdatedCount: false,
      mentionsPending: false,
    };
    
    if (result.message) {
      const msg = result.message.toLowerCase();
      checks.acknowledgesSuggestion = 
        msg.includes('tokyo') || 
        msg.includes('destination') || 
        msg.includes('suggested');
      checks.mentionsMemberName = msg.includes('sam');
      checks.mentionsNewDestination = msg.includes('tokyo');
      // Check if it mentions other destinations (at least one of the existing ones)
      checks.listsAllDestinations = 
        msg.includes('costa rica') || 
        msg.includes('iceland') ||
        msg.includes('3') || // Should mention count
        msg.includes('three');
      checks.showsUpdatedCount = 
        msg.includes('3') || 
        msg.includes('three') ||
        msg.includes('now have');
      checks.mentionsPending = 
        msg.includes('taylor') || 
        msg.includes('waiting') ||
        msg.includes('pending');
    }
    
    // Check if all quality criteria are met
    const allChecksPass = 
      checks.hasMessage &&
      checks.acknowledgesSuggestion &&
      checks.mentionsNewDestination &&
      checks.showsUpdatedCount;
    
    console.log(`\n   ✅ Quality Checks:`);
    console.log(`      Has Message: ${checks.hasMessage ? '✅' : '❌'}`);
    console.log(`      Acknowledges Suggestion: ${checks.acknowledgesSuggestion ? '✅' : '❌'}`);
    console.log(`      Mentions Member Name: ${checks.mentionsMemberName ? '✅' : '❌'}`);
    console.log(`      Mentions New Destination: ${checks.mentionsNewDestination ? '✅' : '❌'}`);
    console.log(`      Lists All Destinations: ${checks.listsAllDestinations ? '✅' : '❌'}`);
    console.log(`      Shows Updated Count: ${checks.showsUpdatedCount ? '✅' : '❌'}`);
    console.log(`      Mentions Pending: ${checks.mentionsPending ? '✅' : '❌'}`);
    
    // Store test result (both passed and failed)
    const testResult = {
      test: 'Subsequent destination suggestion',
      passed: allChecksPass,
      checks,
      message: result.message,
      sendTo: result.sendTo,
      reasoning: result.reasoning,
      agentOutput,
      description: 'Response should acknowledge new suggestion, show updated count, and list destinations',
    };
    if (!results.testResults) {
      results.testResults = [];
    }
    results.testResults.push(testResult);
    
    if (allChecksPass) {
      results.passed++;
      console.log(`\n   ✅ Subsequent destination suggestion → Response quality: PASS`);
    } else {
      results.failed++;
      results.failures.push(testResult);
      console.log(`\n   ❌ Subsequent destination suggestion → Response quality: FAIL`);
    }
  } catch (error) {
    results.failed++;
    results.failures.push({
      test: 'Subsequent destination suggestion',
      error: error.message,
    });
    console.log(`   ❌ Subsequent destination suggestion → Error: ${error.message}`);
  } finally {
    await cleanupTestDB(tripId);
  }
  
  return results;
}

/**
 * Run all responder agent tests
 */
export async function runResponderTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💬 Responder Agent Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const firstDestinationResults = await runFirstDestinationTest();
  const subsequentDestinationResults = await runSubsequentDestinationTest();
  
  const total = firstDestinationResults.passed + firstDestinationResults.failed +
                subsequentDestinationResults.passed + subsequentDestinationResults.failed;
  const passed = firstDestinationResults.passed + subsequentDestinationResults.passed;
  const failed = firstDestinationResults.failed + subsequentDestinationResults.failed;
  const accuracy = total > 0 ? (passed / total * 100).toFixed(1) : 0;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Results:');
  console.log(`   First Destination: ${firstDestinationResults.passed} passed, ${firstDestinationResults.failed} failed`);
  console.log(`   Subsequent Destination: ${subsequentDestinationResults.passed} passed, ${subsequentDestinationResults.failed} failed`);
  console.log(`   Overall: ${accuracy}% accuracy (${passed}/${total} correct)`);
  
  if (firstDestinationResults.failures.length > 0) {
    console.log('\n   ❌ First Destination Failures:');
    for (const failure of firstDestinationResults.failures) {
      if (failure.error) {
        console.log(`      Error: ${failure.error}`);
      } else {
        console.log(`      ${failure.description}`);
        console.log(`      Checks failed: ${Object.entries(failure.checks).filter(([_, v]) => !v).map(([k]) => k).join(', ')}`);
      }
    }
  }
  
  if (subsequentDestinationResults.failures.length > 0) {
    console.log('\n   ❌ Subsequent Destination Failures:');
    for (const failure of subsequentDestinationResults.failures) {
      if (failure.error) {
        console.log(`      Error: ${failure.error}`);
      } else {
        console.log(`      ${failure.description}`);
        console.log(`      Checks failed: ${Object.entries(failure.checks).filter(([_, v]) => !v).map(([k]) => k).join(', ')}`);
      }
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    firstDestination: {
      passed: firstDestinationResults.passed,
      failed: firstDestinationResults.failed,
      failures: firstDestinationResults.failures,
      testResults: firstDestinationResults.testResults || [],
    },
    subsequentDestination: {
      passed: subsequentDestinationResults.passed,
      failed: subsequentDestinationResults.failed,
      failures: subsequentDestinationResults.failures,
      testResults: subsequentDestinationResults.testResults || [],
    },
    overall: {
      accuracy: parseFloat(accuracy),
      passed,
      failed,
      total,
    },
  };
}

