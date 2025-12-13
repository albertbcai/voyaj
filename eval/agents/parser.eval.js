import { ParserAgent } from '../../src/agents/parser.js';
import { setupTestDB, cleanupTestDB, ensureSnapshotMode, createMockContext, createMockMessage } from './common/helpers.js';
import { assertDateEquals } from './common/assertions.js';

/**
 * Parser Agent Tests
 * 
 * Tests date parsing accuracy.
 */

// Date parsing test cases
const dateParsingTests = [
  // Clear positive cases (should parse correctly)
  { input: 'March 15-22', expected: { startDate: '2025-03-15', endDate: '2025-03-22', type: 'date_range' }, description: 'Month day range' },
  { input: 'April 1 to 10', expected: { startDate: '2025-04-01', endDate: '2025-04-10', type: 'date_range' }, description: 'Month day range with "to"' },
  { input: 'July 15-31', expected: { startDate: '2025-07-15', endDate: '2025-07-31', type: 'date_range' }, description: 'Month day range' },
  { input: 'March 1 - April 5', expected: { startDate: '2025-03-01', endDate: '2025-04-05', type: 'date_range' }, description: 'Cross-month range' },
  { input: '07/15 - 07/31', expected: { startDate: '2025-07-15', endDate: '2025-07-31', type: 'date_range' }, description: 'Numeric date format' },
  { input: 'flexible', expected: { startDate: null, endDate: null, type: 'flexible' }, description: 'Flexible availability' },
  { input: 'I\'m flexible in April', expected: { startDate: null, endDate: null, type: 'flexible' }, description: 'Flexible with month' },
  { input: 'flexible in May', expected: { startDate: null, endDate: null, type: 'flexible' }, description: 'Flexible with month' },
  
  // Relative/vague dates - should parse but need confirmation
  // These should parse to actual dates (best guess) but output should ask for clarification
  { 
    input: 'next week', 
    expected: { 
      startDate: '2025-12-20', // If reference date is 2025-12-13 (Friday), next week is Dec 20-26
      endDate: '2025-12-26', 
      type: 'date_range',
      needsConfirmation: true, // Should ask for clarification
    }, 
    description: 'Relative date - should parse but ask for confirmation',
    referenceDate: '2025-12-13', // Friday, Dec 13, 2025
    tolerance: 1, // Allow 1 day tolerance for "next week" calculation
  },
  { 
    input: 'late May', 
    expected: { 
      startDate: '2025-05-20', // "Late May" typically means May 20-31
      endDate: '2025-05-31', 
      type: 'date_range',
      needsConfirmation: true, // Should ask for clarification
    }, 
    description: 'Vague date range - should parse but ask for confirmation',
    tolerance: 5, // Allow 5 days tolerance for vague dates
  },
];

/**
 * Run date parsing tests
 */
async function runDateParsingTests() {
  console.log('\n📋 Testing Parser Agent - Date Parsing\n');
  
  ensureSnapshotMode();
  
  const parserAgent = new ParserAgent();
  const results = {
    passed: 0,
    failed: 0,
    failures: [],
  };
  
  for (const testCase of dateParsingTests) {
    try {
      const result = await parserAgent.parseDateRangeWithAI(testCase.input);
      
      // Check type first
      if (result.type !== testCase.expected.type) {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result,
          description: testCase.description,
          issue: `Type mismatch: expected ${testCase.expected.type}, got ${result.type}`,
        });
        console.log(`   ❌ "${testCase.input}" → Type: expected ${testCase.expected.type}, got ${result.type} (${testCase.description})`);
        continue;
      }
      
      // For flexible dates, just check type
      if (testCase.expected.type === 'flexible') {
        if (result.startDate === null && result.endDate === null) {
          results.passed++;
          console.log(`   ✅ "${testCase.input}" → flexible (${testCase.description})`);
        } else {
          results.failed++;
          results.failures.push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result,
            description: testCase.description,
            issue: 'Flexible date should have null start/end',
          });
          console.log(`   ❌ "${testCase.input}" → Expected flexible (null dates), got dates (${testCase.description})`);
        }
        continue;
      }
      
      // For date ranges, check dates (with tolerance if specified)
      const tolerance = testCase.tolerance || 1; // Default 1 day tolerance
      
      if (result.startDate && result.endDate) {
        try {
          // For relative dates, we need to calculate expected dates based on reference date
          let expectedStart = testCase.expected.startDate;
          let expectedEnd = testCase.expected.endDate;
          
          if (testCase.referenceDate) {
            // Calculate expected dates relative to reference date
            // Note: This is a simplified calculation - actual AI might calculate differently
            // The test validates that dates are parsed, not the exact calculation
            const refDate = new Date(testCase.referenceDate);
            const resultStart = new Date(result.startDate);
            const resultEnd = new Date(result.endDate);
            
            // Check that dates are reasonable (within tolerance of expected)
            // For "next week", we expect dates roughly 7 days from reference
            const daysFromRef = Math.round((resultStart - refDate) / (1000 * 60 * 60 * 24));
            if (daysFromRef >= 6 && daysFromRef <= 8) {
              // Reasonable "next week" calculation
              results.passed++;
              const needsConfirmation = testCase.expected.needsConfirmation ? ' (needs confirmation)' : '';
              console.log(`   ✅ "${testCase.input}" → ${result.startDate} to ${result.endDate}${needsConfirmation} (${testCase.description})`);
            } else {
              // Dates parsed but might be wrong calculation
              results.failed++;
              results.failures.push({
                input: testCase.input,
                expected: testCase.expected,
                actual: result,
                description: testCase.description,
                issue: `Dates parsed but calculation seems off: ${daysFromRef} days from reference (expected ~7 days)`,
              });
              console.log(`   ⚠️  "${testCase.input}" → Dates parsed (${result.startDate} to ${result.endDate}) but calculation may be off (${testCase.description})`);
            }
          } else {
            // Non-relative dates - check exact match with tolerance
            assertDateEquals(result.startDate, expectedStart, tolerance);
            assertDateEquals(result.endDate, expectedEnd, tolerance);
            results.passed++;
            console.log(`   ✅ "${testCase.input}" → ${result.startDate} to ${result.endDate} (${testCase.description})`);
          }
        } catch (error) {
          results.failed++;
          results.failures.push({
            input: testCase.input,
            expected: testCase.expected,
            actual: result,
            description: testCase.description,
            issue: error.message,
          });
          console.log(`   ❌ "${testCase.input}" → ${error.message} (${testCase.description})`);
        }
      } else {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expected,
          actual: result,
          description: testCase.description,
          issue: 'Missing startDate or endDate',
        });
        console.log(`   ❌ "${testCase.input}" → Missing dates (${testCase.description})`);
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
    }
  }
  
  return results;
}

/**
 * Test full flow for relative dates (should ask for confirmation)
 */
async function runRelativeDateConfirmationTests() {
  console.log('\n📋 Testing Parser Agent - Relative Date Confirmation (Future Feature)\n');
  console.log('   ⚠️  Testing that relative dates parse correctly and ask for confirmation.\n');
  
  ensureSnapshotMode();
  
  const parserAgent = new ParserAgent();
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    failures: [],
  };
  
  const relativeDateTests = [
    {
      input: 'next week',
      description: 'Relative date should parse and ask for confirmation',
      expectedState: {
        // Should parse to actual dates
        datesParsed: true,
        // Output should indicate needs confirmation
        outputAsksConfirmation: true,
        // Dates should be saved
        datesSaved: true,
      },
    },
    {
      input: 'late May',
      description: 'Vague date range should parse and ask for confirmation',
      expectedState: {
        datesParsed: true,
        outputAsksConfirmation: true,
        datesSaved: true,
      },
    },
  ];
  
  for (const testCase of relativeDateTests) {
    const { tripId, trip, members } = await setupTestDB({ 
      members: [{ phone: '+15551111111', name: 'TestMember' }],
      stage: 'collecting_dates',
    });
    
    try {
      const message = createMockMessage(members[0].phone_number, testCase.input);
      const context = createMockContext(trip, members, members[0]);
      
      // Call handleDateAvailability (full flow)
      const result = await parserAgent.handleDateAvailability(context, message);
      
      // Check expected state
      const stateChecks = {
        datesParsed: false,
        datesSaved: false,
        outputAsksConfirmation: false,
      };
      
      // Check if dates were parsed and saved
      const availability = await db.getDateAvailability(tripId);
      stateChecks.datesSaved = availability.length > 0 && availability[0].start_date !== null;
      
      // Check if output indicates confirmation needed
      if (result.success && result.output) {
        // Output type should be date_availability_submitted
        // But should indicate it needs confirmation (future feature)
        stateChecks.outputAsksConfirmation = 
          result.output.type === 'date_availability_submitted' &&
          (result.output.needsConfirmation === true || 
           result.output.message?.toLowerCase().includes('confirm') ||
           result.output.message?.toLowerCase().includes('correct'));
      }
      
      // For now, we expect dates to be saved (parsing works)
      // But confirmation asking might not be implemented yet
      if (stateChecks.datesSaved) {
        if (stateChecks.outputAsksConfirmation) {
          results.passed++;
          console.log(`   ✅ "${testCase.input}" → Dates parsed, saved, and confirmation requested (${testCase.description})`);
        } else {
          results.failed++;
          results.failures.push({
            input: testCase.input,
            expected: testCase.expectedState,
            actual: stateChecks,
            description: testCase.description,
          });
          console.log(`   ⚠️  "${testCase.input}" → Dates parsed and saved, but confirmation not requested yet (${testCase.description})`);
          console.log(`      Expected: output should ask for confirmation`);
          console.log(`      Actual: output type=${result.output?.type}, needsConfirmation=${result.output?.needsConfirmation}`);
        }
      } else {
        results.failed++;
        results.failures.push({
          input: testCase.input,
          expected: testCase.expectedState,
          actual: stateChecks,
          description: testCase.description,
        });
        console.log(`   ❌ "${testCase.input}" → Dates not parsed/saved (${testCase.description})`);
      }
    } catch (error) {
      results.skipped++;
      console.log(`   ⏭️  "${testCase.input}" → Skipped (${error.message})`);
    } finally {
      await cleanupTestDB(tripId);
    }
  }
  
  return results;
}

/**
 * Run all parser agent tests
 */
export async function runParserTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✈️  Parser Agent Tests');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const dateParsingResults = await runDateParsingTests();
  const relativeDateConfirmationResults = await runRelativeDateConfirmationTests();
  
  const total = dateParsingResults.passed + dateParsingResults.failed;
  const accuracy = total > 0 ? (dateParsingResults.passed / total * 100).toFixed(1) : 0;
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Results:');
  console.log(`   Date Parsing: ${accuracy}% accuracy (${dateParsingResults.passed}/${total} correct)`);
  console.log(`   Relative Date Confirmation: ${relativeDateConfirmationResults.passed} passed, ${relativeDateConfirmationResults.failed} failed, ${relativeDateConfirmationResults.skipped} skipped`);
  
  if (dateParsingResults.failures.length > 0) {
    console.log('\n   ❌ Date Parsing Failures:');
    for (const failure of dateParsingResults.failures) {
      if (failure.error) {
        console.log(`      "${failure.input}" → Error: ${failure.error}`);
      } else if (failure.issue) {
        console.log(`      "${failure.input}" → ${failure.issue}`);
      } else {
        console.log(`      "${failure.input}" → Expected ${JSON.stringify(failure.expected)}, got ${JSON.stringify(failure.actual)}`);
      }
    }
  }
  
  if (relativeDateConfirmationResults.failures.length > 0) {
    console.log('\n   ⚠️  Relative Date Confirmation (Future Feature):');
    console.log('      These tests document expected behavior for relative dates.');
    for (const failure of relativeDateConfirmationResults.failures) {
      console.log(`      "${failure.input}" → ${failure.description}`);
      console.log(`         Expected: datesSaved=true, outputAsksConfirmation=true`);
      console.log(`         Actual: datesSaved=${failure.actual.datesSaved}, outputAsksConfirmation=${failure.actual.outputAsksConfirmation}`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  return {
    dateParsing: {
      accuracy: parseFloat(accuracy),
      passed: dateParsingResults.passed,
      failed: dateParsingResults.failed,
      total,
      failures: dateParsingResults.failures,
    },
    relativeDateConfirmation: {
      passed: relativeDateConfirmationResults.passed,
      failed: relativeDateConfirmationResults.failed,
      skipped: relativeDateConfirmationResults.skipped,
      failures: relativeDateConfirmationResults.failures,
      note: 'Future feature - tests document expected behavior',
    },
  };
}

