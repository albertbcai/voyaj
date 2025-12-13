import * as db from '../../src/db/queries.js';
import { messageQueue } from '../../src/queue/messageQueue.js';
import { orchestrator } from '../../src/orchestrator.js';
import { resetCostTracker, getCostTracker, calculateCost } from '../../src/utils/claude.js';
import { getSnapshotStats, getSnapshotUsageLog, resetSnapshotUsageLog } from '../../src/utils/snapshotManager.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Scenario Runner - Execute conversation scenarios and validate state transitions
 *
 * Executes a scenario step-by-step:
 * 1. Sends each message from the scenario
 * 2. Waits for processing to complete
 * 3. Captures bot responses with timestamps
 * 4. Validates expectations (stage, data, responses)
 * 5. Generates detailed logs and reports
 */
class ScenarioRunner {
  constructor() {
    this.results = [];
    this.conversations = [];
  }

  /**
   * Run a single scenario from JSON definition
   */
  async runScenario(scenarioPath) {
    const scenario = JSON.parse(await fs.readFile(scenarioPath, 'utf-8'));

    console.log(`\n📋 Running: ${scenario.name}`);
    console.log(`   ${scenario.description}\n`);

    // Reset cost tracker for this scenario
    resetCostTracker();
    
    // Reset snapshot usage log for this scenario
    resetSnapshotUsageLog();

    // Initialize test trip
    const trip = await this.setupTrip(scenario);

    const conversation = {
      scenario: scenario.name,
      description: scenario.description,
      messages: [],
      failures: [],
      startTime: new Date(),
    };

    let allPassed = true;

    // Execute each step
    for (const step of scenario.steps) {
      const stepResult = await this.executeStep(trip.id, step, scenario);
      conversation.messages.push(stepResult);

      if (!stepResult.passed) {
        allPassed = false;
        conversation.failures.push({
          step: step.step,
          message: stepResult.failureReason,
        });
      }

      // Small delay between steps to allow processing
      await this.sleep(100);
    }

    conversation.endTime = new Date();
    conversation.duration = conversation.endTime - conversation.startTime;
    conversation.passed = allPassed;

    // Calculate cost for this scenario
    const costTracker = getCostTracker();
    const estimatedCost = calculateCost(costTracker);
    const snapshotStats = await getSnapshotStats();
    const usingSnapshots = process.env.USE_SNAPSHOTS !== 'false' && snapshotStats.count > 0;
    
    conversation.cost = {
      estimated: estimatedCost,
      inputTokens: costTracker.totalInputTokens,
      outputTokens: costTracker.totalOutputTokens,
      calls: costTracker.calls.length,
      usingSnapshots,
    };

    // Log cost at end of scenario
    if (usingSnapshots && !process.env.RECORD_SNAPSHOTS) {
      if (costTracker.calls.length === 0) {
        console.log(`   🎬 Replay mode: Using snapshots (cost: $0.00, 0 API calls)`);
      } else {
        console.log(`   🎬 Replay mode: Using snapshots + ${costTracker.calls.length} new API calls (cost: ~$${estimatedCost.toFixed(4)})`);
        console.log(`   💡 Tip: Run 'npm run eval:record' to capture missing snapshots`);
      }
    } else if (estimatedCost > 0) {
      const mode = process.env.RECORD_SNAPSHOTS === 'true' ? ' (recording)' : '';
      console.log(`   💰 Estimated cost: ~$${estimatedCost.toFixed(4)}${mode} (${costTracker.calls.length} API calls, ${costTracker.totalInputTokens} input + ${costTracker.totalOutputTokens} output tokens)`);
    }

    this.conversations.push(conversation);

    // Save conversation log
    await this.saveConversationLog(conversation);

    // Cleanup
    await this.cleanupTrip(trip.id);

    return {
      scenario: scenario.name,
      passed: allPassed,
      steps: scenario.steps.length,
      failures: conversation.failures.length,
      duration: conversation.duration,
      cost: estimatedCost,
    };
  }

  /**
   * Execute a single step in the scenario
   */
  async executeStep(tripId, step, scenario) {
    const timestamp = new Date();
    const memberName = this.getMemberName(step.from, scenario);

    console.log(`   Step ${step.step}: ${memberName} → "${step.message}"`);

    // Send message
    const message = {
      from: step.from,
      body: step.message,
      groupChatId: `test-group-${tripId}`,
    };

    // Add to queue and wait for processing
    messageQueue.add(tripId, message);
    await this.waitForProcessing(tripId);

    // Get bot response (last message sent to this phone or group)
    const botResponse = await this.getLastBotResponse(tripId, step.from);

    // Get current trip state
    const trip = await db.getTrip(tripId);
    const members = await db.getMembers(tripId);
    const suggestions = await db.getDestinationSuggestions(tripId);
    const votes = await db.getVotes(tripId);
    const dateAvailability = await db.getDateAvailability(tripId);

    // Validate expectations
    const validation = this.validateExpectations(step.expect, {
      trip,
      members,
      suggestions,
      votes,
      dateAvailability,
      botResponse,
    });

    // Get snapshot usage for this step (snapshots used/missing since last step)
    const snapshotUsage = getSnapshotUsageLog();
    
    const stepResult = {
      step: step.step,
      timestamp,
      from: step.from,
      memberName,
      message: step.message,
      botResponse,
      state: {
        stage: trip.stage,
        memberCount: members.length,
        destination: trip.destination,
        destinationSuggestions: suggestions.map(s => s.destination),
        voteCount: votes.length,
      },
      expectations: step.expect,
      validation,
      passed: validation.passed,
      failureReason: validation.failureReason,
      snapshotUsage: snapshotUsage.length > 0 ? [...snapshotUsage] : undefined, // Copy array
    };
    
    // Clear snapshot log for next step
    resetSnapshotUsageLog();

    // Log result
    if (stepResult.passed) {
      console.log(`   ✅ PASS`);
    } else {
      console.log(`   ❌ FAIL: ${stepResult.failureReason}`);
    }

    if (botResponse) {
      console.log(`   Bot: "${botResponse}"`);
    }

    return stepResult;
  }

  /**
   * Validate expectations against actual state
   */
  validateExpectations(expect, actual) {
    if (!expect) {
      return { passed: true };
    }

    const failures = [];

    // Check stage
    if (expect.stage && expect.stage !== actual.trip.stage) {
      failures.push(`stage: expected "${expect.stage}", got "${actual.trip.stage}"`);
    }

    // Check member count
    if (expect.memberCount !== undefined && expect.memberCount !== actual.members.length) {
      failures.push(`memberCount: expected ${expect.memberCount}, got ${actual.members.length}`);
    }

    // Check destination
    if (expect.destination && expect.destination !== actual.trip.destination) {
      failures.push(`destination: expected "${expect.destination}", got "${actual.trip.destination}"`);
    }

    // Check destination suggestions
    if (expect.destinationSuggestions) {
      const actualSuggestions = actual.suggestions.map(s => s.destination);
      if (!this.arraysEqual(expect.destinationSuggestions, actualSuggestions)) {
        failures.push(`destinationSuggestions: expected [${expect.destinationSuggestions}], got [${actualSuggestions}]`);
      }
    }

    // Check vote count
    if (expect.voteCount !== undefined && expect.voteCount !== actual.votes.length) {
      failures.push(`voteCount: expected ${expect.voteCount}, got ${actual.votes.length}`);
    }

    // Check response content (must mention certain things)
    // Skip in replay mode - AI response quality is tested with real API snapshots
    const usingSnapshots = process.env.USE_SNAPSHOTS !== 'false';
    if (expect.responseMustContain && actual.botResponse && !usingSnapshots) {
      for (const text of expect.responseMustContain) {
        if (!actual.botResponse.includes(text)) {
          failures.push(`response missing: "${text}"`);
        }
      }
    }

    return {
      passed: failures.length === 0,
      failureReason: failures.length > 0 ? failures.join('; ') : null,
      failures,
    };
  }

  /**
   * Setup test trip with members
   */
  async setupTrip(scenario) {
    const trip = await db.createTrip({
      inviteCode: `test-${Date.now()}`,
      groupChatId: `test-group-${Date.now()}`,
    });
    return trip;
  }

  /**
   * Cleanup test trip
   */
  async cleanupTrip(tripId) {
    // Delete all test data
    await db.pool.query('DELETE FROM messages WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM destination_suggestions WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM votes WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM date_availability WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM flights WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM members WHERE trip_id = $1', [tripId]);
    await db.pool.query('DELETE FROM trips WHERE id = $1', [tripId]);

    // Clear message queue
    messageQueue.clearQueue(tripId);
  }

  /**
   * Wait for message queue to finish processing
   */
  async waitForProcessing(tripId, maxWaitMs = 30000) {
    const startTime = Date.now();

    // Wait for queue to be empty AND processing to complete
    while (messageQueue.getQueueLength(tripId) > 0 || messageQueue.isProcessing(tripId)) {
      await this.sleep(100);

      if (Date.now() - startTime > maxWaitMs) {
        throw new Error(`Timeout waiting for message processing (tripId: ${tripId})`);
      }
    }

    // Extra delay to ensure all async operations complete
    await this.sleep(500);
  }

  /**
   * Get last bot response for this trip
   */
  async getLastBotResponse(tripId, phone) {
    const result = await db.pool.query(
      `SELECT body FROM messages
       WHERE trip_id = $1
       AND (from_phone = 'bot' OR source = 'bot')
       ORDER BY received_at DESC
       LIMIT 1`,
      [tripId]
    );

    return result.rows[0]?.body || null;
  }

  /**
   * Get member name from phone number
   */
  getMemberName(phone, scenario) {
    const member = scenario.members.find(m => m.phone === phone);
    return member ? member.name : phone;
  }

  /**
   * Save conversation log to file
   */
  async saveConversationLog(conversation) {
    const logPath = path.join(
      process.cwd(),
      'eval',
      'scenarios',
      'output',
      `${conversation.scenario}.log`
    );

    let log = `📋 Scenario: ${conversation.scenario}\n`;
    log += `   ${conversation.description}\n`;
    log += `   Started: ${conversation.startTime.toISOString()}\n`;
    log += `   Duration: ${conversation.duration}ms\n`;
    if (conversation.cost) {
      log += `   💰 Estimated Cost: ~$${conversation.cost.estimated.toFixed(4)} (${conversation.cost.calls} API calls, ${conversation.cost.inputTokens} input tokens, ${conversation.cost.outputTokens} output tokens)\n`;
    }
    log += `   Result: ${conversation.passed ? '✅ PASS' : '❌ FAIL'}\n\n`;

    log += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    for (const msg of conversation.messages) {
      log += `Step ${msg.step} [${msg.timestamp.toISOString()}]\n`;
      log += `${msg.memberName}: "${msg.message}"\n`;

      // Add snapshot usage info if available
      if (msg.snapshotUsage && msg.snapshotUsage.length > 0) {
        log += `\n📸 Snapshot Usage:\n`;
        for (const usage of msg.snapshotUsage) {
          if (usage.type === 'used') {
            log += `   ✅ Snapshot used: ${usage.snapshotFile} (key: ${usage.key}...)\n`;
          } else if (usage.type === 'missing') {
            log += `   ⚠️  Snapshot missing: ${usage.key}... (used real API)\n`;
            if (usage.promptPreview) {
              log += `      Prompt: ${usage.promptPreview}...\n`;
            }
          }
        }
      }

      if (msg.botResponse) {
        log += `Bot: "${msg.botResponse}"\n`;
      }

      log += `\nState:\n`;
      log += `  stage: ${msg.state.stage}\n`;
      log += `  memberCount: ${msg.state.memberCount}\n`;
      if (msg.state.destination) {
        log += `  destination: ${msg.state.destination}\n`;
      }
      if (msg.state.destinationSuggestions.length > 0) {
        log += `  suggestions: [${msg.state.destinationSuggestions.join(', ')}]\n`;
      }
      if (msg.state.voteCount > 0) {
        log += `  voteCount: ${msg.state.voteCount}\n`;
      }

      if (msg.passed) {
        log += `\n✅ PASS\n`;
      } else {
        log += `\n❌ FAIL: ${msg.failureReason}\n`;
      }

      log += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    }

    if (conversation.failures.length > 0) {
      log += `\n❌ FAILURES:\n`;
      for (const failure of conversation.failures) {
        log += `  Step ${failure.step}: ${failure.message}\n`;
      }
    }

    await fs.writeFile(logPath, log);

    // Also save JSON for UI
    const jsonPath = logPath.replace('.log', '.json');
    await fs.writeFile(jsonPath, JSON.stringify(conversation, null, 2));
  }

  /**
   * Generate summary report
   */
  generateReport() {
    const total = this.conversations.length;
    const passed = this.conversations.filter(c => c.passed).length;
    const failed = this.conversations.filter(c => !c.passed).length;
    const totalDuration = this.conversations.reduce((sum, c) => sum + c.duration, 0);
    const totalCost = this.conversations.reduce((sum, c) => sum + (c.cost?.estimated || 0), 0);

    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📊 EVALUATION REPORT\n');
    console.log(`   Total scenarios: ${total}`);
    console.log(`   ✅ Passed: ${passed} (${((passed/total)*100).toFixed(0)}%)`);
    console.log(`   ❌ Failed: ${failed} (${((failed/total)*100).toFixed(0)}%)`);
    console.log(`   ⏱️  Total time: ${(totalDuration/1000).toFixed(1)}s`);
    if (totalCost > 0) {
      console.log(`   💰 Total cost: ~$${totalCost.toFixed(4)}\n`);
    } else {
      console.log('');
    }

    if (failed > 0) {
      console.log('Failed scenarios:');
      for (const conv of this.conversations.filter(c => !c.passed)) {
        console.log(`   ❌ ${conv.scenario} (${conv.failures.length} failures)`);
        for (const failure of conv.failures) {
          console.log(`      Step ${failure.step}: ${failure.message}`);
        }
      }
      console.log('');
    }

    console.log('📁 Logs saved to: eval/scenarios/output/');
    console.log('👁️  View UI: open eval/ui/index.html\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    return {
      total,
      passed,
      failed,
      passRate: passed / total,
      totalDuration,
      conversations: this.conversations.map(c => ({
        scenario: c.scenario,
        passed: c.passed,
        steps: c.messages.length,
        failures: c.failures.length,
        duration: c.duration,
      })),
    };
  }

  // Utility methods
  arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { ScenarioRunner };
