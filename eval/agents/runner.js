#!/usr/bin/env node

/**
 * Agent Isolation Test Runner
 * 
 * Runs agent tests in isolation to measure classification accuracy.
 * Uses snapshot mode by default (replay saved API responses).
 * 
 * Usage:
 *   npm run eval:agents                    # Run all agent tests
 *   npm run eval:agents coordinator        # Run specific agent tests
 */

import { runCoordinatorTests } from './coordinator.eval.js';
import { runVotingTests } from './voting.eval.js';
import { runParserTests } from './parser.eval.js';
import { runResponderTests } from './responder.eval.js';
import { getSnapshotStats } from '../../src/utils/snapshotManager.js';
import { config } from '../../src/config/index.js';
import fs from 'fs/promises';
import path from 'path';

// Ensure snapshot mode is enabled by default
if (process.env.USE_SNAPSHOTS !== 'false') {
  process.env.USE_SNAPSHOTS = 'true';
}

async function main() {
  const args = process.argv.slice(2);
  const specificAgent = args[0];
  
  const snapshotStats = await getSnapshotStats();
  
  console.log('\n🧪 Agent Isolation Tests\n');
  
  if (process.env.USE_SNAPSHOTS !== 'false' && snapshotStats.count > 0) {
    console.log(`🎬 Using ${snapshotStats.count} saved snapshots (free, fast, deterministic)\n`);
  } else if (process.env.USE_SNAPSHOTS === 'false') {
    console.log(`💰 Live Mode: Using real API (${config.claude.defaultModel})\n`);
    console.log(`   💡 Tip: Use default mode to replay from snapshots (free, fast)\n`);
  } else {
    console.log(`⚠️  No snapshots found. Running with real API (will cost money).\n`);
    console.log(`   💡 Run 'npm run eval:record' first to record snapshots (one-time cost)\n`);
  }
  
  const results = {};
  
  // Run agent tests (or specific agent if requested)
  if (!specificAgent || specificAgent === 'coordinator') {
    results.coordinator = await runCoordinatorTests();
  }
  
  if (!specificAgent || specificAgent === 'voting') {
    results.voting = await runVotingTests();
  }
  
  if (!specificAgent || specificAgent === 'parser') {
    results.parser = await runParserTests();
  }
  
  if (!specificAgent || specificAgent === 'responder') {
    results.responder = await runResponderTests();
  }
  
  // Generate summary report
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  if (results.coordinator) {
    const nameVal = results.coordinator.nameValidation;
    totalPassed += nameVal.passed;
    totalFailed += nameVal.failed;
    
    console.log('Coordinator Agent:');
    console.log(`   Clear Cases: ${nameVal.clearAccuracy}% (${nameVal.passed}/${nameVal.clearTotal})`);
    if (nameVal.ambiguous > 0) {
      console.log(`   ⚠️  Ambiguous: ${nameVal.ambiguous} cases (tracked separately)`);
    }
    if (nameVal.failed > 0) {
      console.log(`   ❌ ${nameVal.failed} clear failures`);
    }
    console.log('');
  }
  
  if (results.voting) {
    const voteParsing = results.voting.voteParsing;
    const destNorm = results.voting.destinationNormalization;
    totalPassed += voteParsing.passed + destNorm.passed;
    totalFailed += voteParsing.failed + destNorm.failed;
    
    console.log('Voting Agent:');
    console.log(`   Vote Parsing: ${voteParsing.accuracy}% (${voteParsing.passed}/${voteParsing.total})`);
    console.log(`   Destination Normalization: ${destNorm.accuracy}% (${destNorm.passed}/${destNorm.total})`);
    if (voteParsing.failed > 0 || destNorm.failed > 0) {
      console.log(`   ❌ ${voteParsing.failed + destNorm.failed} failures`);
    }
    console.log('');
  }
  
  if (results.parser) {
    const dateParsing = results.parser.dateParsing;
    const relativeDateConfirmation = results.parser.relativeDateConfirmation;
    totalPassed += dateParsing.passed;
    totalFailed += dateParsing.failed;
    
    console.log('Parser Agent:');
    console.log(`   Date Parsing: ${dateParsing.accuracy}% (${dateParsing.passed}/${dateParsing.total})`);
    if (relativeDateConfirmation) {
      console.log(`   Relative Date Confirmation: ${relativeDateConfirmation.passed} passed, ${relativeDateConfirmation.failed} failed (future feature)`);
    }
    if (dateParsing.failed > 0) {
      console.log(`   ❌ ${dateParsing.failed} failures`);
    }
    console.log('');
  }
  
  if (results.responder) {
    const overall = results.responder.overall;
    totalPassed += overall.passed;
    totalFailed += overall.failed;
    
    console.log('Responder Agent:');
    console.log(`   First Destination: ${results.responder.firstDestination.passed} passed, ${results.responder.firstDestination.failed} failed`);
    console.log(`   Subsequent Destination: ${results.responder.subsequentDestination.passed} passed, ${results.responder.subsequentDestination.failed} failed`);
    console.log(`   Overall: ${overall.accuracy}% (${overall.passed}/${overall.total})`);
    if (overall.failed > 0) {
      console.log(`   ❌ ${overall.failed} failures`);
    }
    console.log('');
  }
  
  const total = totalPassed + totalFailed;
  const overallAccuracy = total > 0 ? ((totalPassed / total) * 100).toFixed(1) : 0;
  
  console.log(`Overall (clear cases): ${overallAccuracy}% accuracy (${totalPassed}/${total} correct)`);
  
  // Save results to file
  const testRun = {
    timestamp: new Date().toISOString(),
    agents: specificAgent || 'all',
    snapshotMode: process.env.USE_SNAPSHOTS !== 'false',
    snapshotStats: {
      count: snapshotStats.count,
    },
    results,
    summary: {
      totalPassed,
      totalFailed,
      total,
      overallAccuracy: parseFloat(overallAccuracy),
    },
  };
  
  await saveTestResults(testRun, specificAgent);
  
  if (totalFailed > 0) {
    console.log(`\n❌ ${totalFailed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All clear tests passed!');
    process.exit(0);
  }
}

/**
 * Save test results to log and JSON files
 */
async function saveTestResults(testRun, specificAgent) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const agentSuffix = specificAgent ? `-${specificAgent}` : '';
  const filename = `agent-tests${agentSuffix}-${timestamp}`;
  
  const outputDir = path.join(process.cwd(), 'eval', 'agents', 'output');
  const logPath = path.join(outputDir, `${filename}.log`);
  const jsonPath = path.join(outputDir, `${filename}.json`);
  
  // Generate log file
  let log = `🧪 Agent Isolation Tests\n`;
  log += `   Timestamp: ${testRun.timestamp}\n`;
  log += `   Agents: ${testRun.agents}\n`;
  log += `   Snapshot Mode: ${testRun.snapshotMode ? '✅ Enabled' : '❌ Disabled'}\n`;
  if (testRun.snapshotStats.count > 0) {
    const sizeKB = testRun.snapshotStats.totalSize ? (testRun.snapshotStats.totalSize / 1024).toFixed(2) : 'N/A';
    log += `   Snapshots: ${testRun.snapshotStats.count} (${sizeKB} KB)\n`;
  }
  log += `   Result: ${testRun.summary.totalFailed === 0 ? '✅ PASS' : '❌ FAIL'}\n\n`;
  
  log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  log += `📊 SUMMARY\n\n`;
  log += `Overall: ${testRun.summary.overallAccuracy}% accuracy (${testRun.summary.totalPassed}/${testRun.summary.total} correct)\n\n`;
  
  // Coordinator Agent Results
  if (testRun.results.coordinator) {
    const nameVal = testRun.results.coordinator.nameValidation;
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    log += `👤 Coordinator Agent - Name Validation\n`;
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    log += `Clear Cases: ${nameVal.clearAccuracy}% accuracy (${nameVal.passed}/${nameVal.clearTotal} correct)\n`;
    if (nameVal.ambiguous > 0) {
      log += `Ambiguous Cases: ${nameVal.ambiguous} (tracked separately)\n`;
    }
    log += `Overall: ${nameVal.passed}/${nameVal.overallTotal} passed\n\n`;
    
    if (nameVal.failures.length > 0) {
      log += `❌ Clear Failures (${nameVal.failures.length}):\n`;
      for (const failure of nameVal.failures) {
        const contextStr = failure.context?.length > 0 ? ` [context: ${failure.context.map(m => m.name).join(', ')}]` : '';
        if (failure.error) {
          log += `   "${failure.input}"${contextStr} → Error: ${failure.error}\n`;
        } else {
          log += `   "${failure.input}"${contextStr} → Expected ${failure.expected ? 'name' : 'not name'}, got ${failure.actual ? 'name' : 'not name'}\n`;
          if (failure.description) {
            log += `      Description: ${failure.description}\n`;
          }
        }
      }
      log += `\n`;
    }
    
    if (nameVal.ambiguousFailures.length > 0) {
      log += `⚠️  Ambiguous Cases (${nameVal.ambiguousFailures.length}):\n`;
      for (const failure of nameVal.ambiguousFailures) {
        const contextStr = failure.context?.length > 0 ? ` [context: ${failure.context.map(m => m.name).join(', ')}]` : '';
        log += `   "${failure.input}"${contextStr} → Expected ${failure.expected ? 'name' : 'not name'}, got ${failure.actual ? 'name' : 'not name'} (inherently ambiguous)\n`;
        if (failure.description) {
          log += `      Description: ${failure.description}\n`;
        }
      }
      log += `\n`;
    }
  }
  
  // Voting Agent Results
  if (testRun.results.voting) {
    const voteParsing = testRun.results.voting.voteParsing;
    const destNorm = testRun.results.voting.destinationNormalization;
    const addOption = testRun.results.voting.addOptionMidVote;
    
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    log += `🗳️  Voting Agent\n`;
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    log += `Vote Parsing: ${voteParsing.accuracy}% accuracy (${voteParsing.passed}/${voteParsing.total} correct)\n`;
    if (voteParsing.failures.length > 0) {
      log += `\n❌ Vote Parsing Failures (${voteParsing.failures.length}):\n`;
      for (const failure of voteParsing.failures) {
        log += `   "${failure.input}" → Expected: ${failure.expected || 'null'}, Got: ${failure.actual || 'null'}\n`;
        if (failure.description) {
          log += `      Description: ${failure.description}\n`;
        }
        if (failure.options) {
          log += `      Options: [${failure.options.join(', ')}]\n`;
        }
      }
      log += `\n`;
    }
    
    log += `Destination Normalization: ${destNorm.accuracy}% accuracy (${destNorm.passed}/${destNorm.total} correct)\n`;
    if (destNorm.failures.length > 0) {
      log += `\n❌ Destination Normalization Failures (${destNorm.failures.length}):\n`;
      for (const failure of destNorm.failures) {
        log += `   "${failure.input}" → Expected: ${JSON.stringify(failure.expected)}, Got: ${JSON.stringify(failure.actual)}\n`;
        if (failure.description) {
          log += `      Description: ${failure.description}\n`;
        }
      }
      log += `\n`;
    }
    
    if (addOption) {
      log += `Add Option Mid-Vote (Future Feature): ${addOption.passed} passed, ${addOption.failed} failed\n`;
      if (addOption.failures.length > 0) {
        log += `\n⚠️  Future Feature Failures (${addOption.failures.length}):\n`;
        log += `   Note: ${addOption.note}\n`;
        for (const failure of addOption.failures) {
          log += `   "${failure.input}" → Expected state not yet implemented\n`;
          if (failure.expectedState) {
            log += `      Expected: ${JSON.stringify(failure.expectedState, null, 2)}\n`;
          }
          if (failure.actual) {
            log += `      Actual: ${JSON.stringify(failure.actual, null, 2)}\n`;
          }
        }
        log += `\n`;
      }
    }
  }
  
  // Parser Agent Results
  if (testRun.results.parser) {
    const dateParsing = testRun.results.parser.dateParsing;
    const relativeDate = testRun.results.parser.relativeDateConfirmation;
    
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    log += `📅 Parser Agent\n`;
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    log += `Date Parsing: ${dateParsing.accuracy}% accuracy (${dateParsing.passed}/${dateParsing.total} correct)\n`;
    if (dateParsing.failures.length > 0) {
      log += `\n❌ Date Parsing Failures (${dateParsing.failures.length}):\n`;
      for (const failure of dateParsing.failures) {
        log += `   "${failure.input}" → Expected: ${JSON.stringify(failure.expected)}, Got: ${JSON.stringify(failure.actual)}\n`;
        if (failure.description) {
          log += `      Description: ${failure.description}\n`;
        }
        if (failure.referenceDate) {
          log += `      Reference Date: ${failure.referenceDate}\n`;
        }
        if (failure.tolerance) {
          log += `      Tolerance: ±${failure.tolerance} days\n`;
        }
      }
      log += `\n`;
    }
    
    if (relativeDate) {
      log += `Relative Date Confirmation (Future Feature): ${relativeDate.passed} passed, ${relativeDate.failed} failed\n`;
      if (relativeDate.failures.length > 0) {
        log += `\n⚠️  Future Feature Failures (${relativeDate.failures.length}):\n`;
        log += `   Note: ${relativeDate.note}\n`;
        for (const failure of relativeDate.failures) {
          log += `   "${failure.input}" → ${failure.description}\n`;
          if (failure.expected) {
            log += `      Expected: ${JSON.stringify(failure.expected, null, 2)}\n`;
          }
          if (failure.actual) {
            log += `      Actual: ${JSON.stringify(failure.actual, null, 2)}\n`;
          }
        }
        log += `\n`;
      }
    }
  }
  
  // Responder Agent Results
  if (testRun.results.responder) {
    const responder = testRun.results.responder;
    const overall = responder.overall;
    
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    log += `💬 Responder Agent\n`;
    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // First Destination Test Results
    log += `First Destination: ${responder.firstDestination.passed} passed, ${responder.firstDestination.failed} failed\n`;
    if (responder.firstDestination.testResults && responder.firstDestination.testResults.length > 0) {
      for (const testResult of responder.firstDestination.testResults) {
        log += `\n   Test: ${testResult.test}\n`;
        log += `   Status: ${testResult.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (testResult.agentOutput) {
          log += `   Agent Output:\n`;
          log += `      Type: ${testResult.agentOutput.type}\n`;
          log += `      Member: ${testResult.agentOutput.memberName}\n`;
          log += `      Destinations: ${JSON.stringify(testResult.agentOutput.destinations)}\n`;
          log += `      Suggestion Count: ${testResult.agentOutput.suggestionCount}\n`;
          log += `      Member Count: ${testResult.agentOutput.memberCount}\n`;
          if (testResult.agentOutput.pendingMembers) {
            log += `      Pending Members: ${JSON.stringify(testResult.agentOutput.pendingMembers)}\n`;
          }
        }
        log += `   Response:\n`;
        log += `      Message: ${testResult.message ? `"${testResult.message}"` : 'null'}\n`;
        log += `      Send To: ${testResult.sendTo || 'N/A'}\n`;
        log += `      Reasoning: ${testResult.reasoning || 'N/A'}\n`;
        log += `   Quality Checks:\n`;
        if (testResult.checks) {
          for (const [check, passed] of Object.entries(testResult.checks)) {
            log += `      ${check}: ${passed ? '✅' : '❌'}\n`;
          }
        }
      }
      log += `\n`;
    }
    
    // Subsequent Destination Test Results
    log += `Subsequent Destination: ${responder.subsequentDestination.passed} passed, ${responder.subsequentDestination.failed} failed\n`;
    if (responder.subsequentDestination.testResults && responder.subsequentDestination.testResults.length > 0) {
      for (const testResult of responder.subsequentDestination.testResults) {
        log += `\n   Test: ${testResult.test}\n`;
        log += `   Status: ${testResult.passed ? '✅ PASS' : '❌ FAIL'}\n`;
        if (testResult.agentOutput) {
          log += `   Agent Output:\n`;
          log += `      Type: ${testResult.agentOutput.type}\n`;
          log += `      Member: ${testResult.agentOutput.memberName}\n`;
          log += `      Destinations: ${JSON.stringify(testResult.agentOutput.destinations)}\n`;
          log += `      Suggestion Count: ${testResult.agentOutput.suggestionCount}\n`;
          log += `      Member Count: ${testResult.agentOutput.memberCount}\n`;
          if (testResult.agentOutput.pendingMembers) {
            log += `      Pending Members: ${JSON.stringify(testResult.agentOutput.pendingMembers)}\n`;
          }
        }
        log += `   Response:\n`;
        log += `      Message: ${testResult.message ? `"${testResult.message}"` : 'null'}\n`;
        log += `      Send To: ${testResult.sendTo || 'N/A'}\n`;
        log += `      Reasoning: ${testResult.reasoning || 'N/A'}\n`;
        log += `   Quality Checks:\n`;
        if (testResult.checks) {
          for (const [check, passed] of Object.entries(testResult.checks)) {
            log += `      ${check}: ${passed ? '✅' : '❌'}\n`;
          }
        }
      }
      log += `\n`;
    }
    
    log += `Overall: ${overall.accuracy}% accuracy (${overall.passed}/${overall.total} correct)\n\n`;
  }
  
  log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  log += `\nTest run completed at ${testRun.timestamp}\n`;
  
  // Write files
  await fs.writeFile(logPath, log);
  await fs.writeFile(jsonPath, JSON.stringify(testRun, null, 2));
  
  console.log(`\n💾 Results saved to:`);
  console.log(`   📄 ${logPath}`);
  console.log(`   📄 ${jsonPath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

