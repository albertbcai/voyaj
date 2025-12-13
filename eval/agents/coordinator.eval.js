import { CoordinatorAgent } from '../../src/agents/coordinator.js';
import { setupTestDB, cleanupTestDB, ensureSnapshotMode } from './common/helpers.js';
import assert from 'assert';

/**
 * Coordinator Agent Tests
 * 
 * Tests the coordinator's AI classification decisions, focusing on name validation.
 */

// Name validation test cases
// Structure: { input, expected, description, context?: existingMembers, ambiguous?: true }
const nameValidationTests = [
  // Clear positive cases (should be recognized as names)
  { input: 'Sarah', expected: true, description: 'Simple name' },
  { input: 'Mike', expected: true, description: 'Simple name' },
  { input: 'Alex', expected: true, description: 'Simple name' },
  { input: 'John', expected: true, description: 'Simple name' },
  { input: 'Emily', expected: true, description: 'Simple name' },
  { input: 'I\'m Sarah', expected: true, description: 'Name in sentence' },
  { input: 'My name is Sarah', expected: true, description: 'Name in sentence' },
  { input: 'This is Alex', expected: true, description: 'Name in sentence' },
  { input: 'John Smith', expected: true, description: 'Full name' },
  { input: 'Sarah Johnson', expected: true, description: 'Full name' },
  
  // Clear negative cases (should NOT be recognized as names)
  { input: 'What dates work?', expected: false, description: 'Question, not name' },
  { input: 'When are we going?', expected: false, description: 'Question, not name' },
  { input: 'march or april', expected: false, description: 'Dates phrase, not name' },
  { input: 'March 15', expected: false, description: 'Date with number, not name' },
  { input: '1', expected: false, description: 'Number, not name' },
  { input: 'yes', expected: false, description: 'Common word, not name' },
  { input: 'ok', expected: false, description: 'Common word, not name' },
  { input: 'somewhere with good food', expected: false, description: 'Vague preference, not name' },
  
  // Ambiguous cases - could be names OR something else
  // These are tracked separately because they're inherently ambiguous
  { input: 'March', expected: false, description: 'Month name (ambiguous - could be person name)', ambiguous: true },
  { input: 'may', expected: false, description: 'Month name (ambiguous - could be person name)', ambiguous: true },
  { input: 'April', expected: false, description: 'Month name (ambiguous - could be person name)', ambiguous: true },
  { input: 'Tokyo', expected: false, description: 'Destination (ambiguous - unlikely but possible name)', ambiguous: true },
  { input: 'Paris', expected: false, description: 'Destination (ambiguous - unlikely but possible name)', ambiguous: true },
  { input: 'Bali', expected: false, description: 'Destination (ambiguous - unlikely but possible name)', ambiguous: true },
  
  // Context-based tests - test with existing members to see if context helps
  { input: 'Tokyo', expected: false, description: 'Destination with context (existing members: Sarah, Mike)', 
    context: [{ name: 'Sarah' }, { name: 'Mike' }] },
];

/**
 * Run name validation tests
 */
async function runNameValidationTests() {
  console.log('\n📋 Testing Coordinator Agent - Name Validation\n');
  
  ensureSnapshotMode();
  
  const coordinator = new CoordinatorAgent();
  const results = {
    passed: 0,
    failed: 0,
    ambiguous: 0,
    failures: [],
    ambiguousFailures: [],
  };
  
  for (const testCase of nameValidationTests) {
    // Setup minimal test DB (agents may need it for context)
    const { tripId } = await setupTestDB();
    
    try {
      // Use context if provided, otherwise empty array (first member scenario)
      const contextMembers = testCase.context || [];
      const result = await coordinator.validateNameWithAI(testCase.input, contextMembers);
      
      if (result === testCase.expected) {
        results.passed++;
        const contextStr = contextMembers.length > 0 ? ` [context: ${contextMembers.map(m => m.name).join(', ')}]` : '';
        const ambiguousStr = testCase.ambiguous ? ' ⚠️ (ambiguous)' : '';
        console.log(`   ✅ "${testCase.input}" → ${testCase.expected ? 'is name' : 'not name'}${contextStr}${ambiguousStr}`);
      } else {
        // Track ambiguous cases separately
        if (testCase.ambiguous) {
          results.ambiguous++;
          results.ambiguousFailures.push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result,
            description: testCase.description,
            context: contextMembers,
          });
          const contextStr = contextMembers.length > 0 ? ` [context: ${contextMembers.map(m => m.name).join(', ')}]` : '';
          console.log(`   ⚠️  "${testCase.input}" → Expected ${testCase.expected ? 'name' : 'not name'}, got ${result ? 'name' : 'not name'}${contextStr} (ambiguous case)`);
        } else {
          results.failed++;
          results.failures.push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result,
            description: testCase.description,
            context: contextMembers,
          });
          const contextStr = contextMembers.length > 0 ? ` [context: ${contextMembers.map(m => m.name).join(', ')}]` : '';
          console.log(`   ❌ "${testCase.input}" → Expected ${testCase.expected ? 'name' : 'not name'}, got ${result ? 'name' : 'not name'}${contextStr}`);
        }
      }
    } catch (error) {
      results.failed++;
      results.failures.push({
        input: testCase.input,
        expected: testCase.expected,
        actual: null,
        description: testCase.description,
        error: error.message,
        context: testCase.context || [],
      });
      console.log(`   ❌ "${testCase.input}" → Error: ${error.message}`);
    } finally {
      await cleanupTestDB(tripId);
    }
  }
  
  return results;
}

/**
 * Run all coordinator tests
 */
export async function runCoordinatorTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('👤 Coordinator Agent Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const nameValidationResults = await runNameValidationTests();
  
  // Calculate accuracy on clear cases only (excluding ambiguous)
  const clearTotal = nameValidationResults.passed + nameValidationResults.failed;
  const clearAccuracy = clearTotal > 0 ? (nameValidationResults.passed / clearTotal * 100).toFixed(1) : 0;
  
  // Overall total includes ambiguous
  const overallTotal = nameValidationResults.passed + nameValidationResults.failed + nameValidationResults.ambiguous;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Results:');
  console.log(`   Clear Cases: ${clearAccuracy}% accuracy (${nameValidationResults.passed}/${clearTotal} correct)`);
  if (nameValidationResults.ambiguous > 0) {
    console.log(`   Ambiguous Cases: ${nameValidationResults.ambiguous} (tracked separately - could be either)`);
  }
  console.log(`   Overall: ${nameValidationResults.passed}/${overallTotal} passed`);
  
  if (nameValidationResults.failures.length > 0) {
    console.log('\n   ❌ Clear Failures:');
    for (const failure of nameValidationResults.failures) {
      if (failure.error) {
        console.log(`      "${failure.input}" → Error: ${failure.error}`);
      } else {
        const contextStr = failure.context?.length > 0 ? ` [context: ${failure.context.map(m => m.name).join(', ')}]` : '';
        console.log(`      "${failure.input}"${contextStr} → Expected ${failure.expected ? 'name' : 'not name'}, got ${failure.actual ? 'name' : 'not name'}`);
      }
    }
  }
  
  if (nameValidationResults.ambiguousFailures.length > 0) {
    console.log('\n   ⚠️  Ambiguous Cases (not counted as failures):');
    for (const failure of nameValidationResults.ambiguousFailures) {
      const contextStr = failure.context?.length > 0 ? ` [context: ${failure.context.map(m => m.name).join(', ')}]` : '';
      console.log(`      "${failure.input}"${contextStr} → Expected ${failure.expected ? 'name' : 'not name'}, got ${failure.actual ? 'name' : 'not name'} (inherently ambiguous)`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    nameValidation: {
      clearAccuracy: parseFloat(clearAccuracy),
      passed: nameValidationResults.passed,
      failed: nameValidationResults.failed,
      ambiguous: nameValidationResults.ambiguous,
      clearTotal,
      overallTotal,
      failures: nameValidationResults.failures,
      ambiguousFailures: nameValidationResults.ambiguousFailures,
    },
  };
}

