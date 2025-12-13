#!/usr/bin/env node

/**
 * Voyaj Evaluation Framework
 *
 * Run all evaluation scenarios to test state transitions,
 * agent behavior, and conversation flows.
 *
 * Usage:
 *   npm run eval                    # Replay from snapshots (default, free, fast)
 *   npm run eval:record             # Record snapshots (one-time, uses real API)
 *   npm run eval:live                # Force real API (update snapshots)
 *   npm run eval scenario-name      # Run specific scenario
 */

import { ScenarioRunner } from './lib/scenario-runner.js';
import { getSnapshotStats } from '../src/utils/snapshotManager.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  
  const args = process.argv.slice(2);
  
  // Parse flags and env vars
  const isRecordMode = args.includes('--record') || args.includes('-r') || process.env.RECORD_SNAPSHOTS === 'true';
  const isLiveMode = args.includes('--live') || args.includes('-l') || process.env.USE_SNAPSHOTS === 'false';
  const filteredArgs = args.filter(arg => !arg.startsWith('--') && arg !== '-r' && arg !== '-l');
  const specificScenario = filteredArgs[0];
  
  // Set snapshot mode (override with flags if provided)
  if (isRecordMode) {
    process.env.RECORD_SNAPSHOTS = 'true';
    process.env.USE_SNAPSHOTS = 'true'; // Also use existing snapshots while recording
  } else if (isLiveMode) {
    process.env.USE_SNAPSHOTS = 'false'; // Force real API, don't use snapshots
    process.env.RECORD_SNAPSHOTS = 'false';
  } else {
    // Default: replay mode (use snapshots)
    process.env.USE_SNAPSHOTS = 'true';
    process.env.RECORD_SNAPSHOTS = 'false';
  }

  // Import config after setting env vars
  const { config } = await import('../src/config/index.js');
  const snapshotStats = await getSnapshotStats();
  
  console.log('\n🧪 Voyaj Evaluation Framework\n');
  
  if (isRecordMode) {
    console.log(`📹 Record Mode: Recording snapshots (using real API + saving responses)\n`);
    console.log(`   💡 This will use real API calls and save responses for future replay\n`);
  } else if (isLiveMode) {
    console.log(`💰 Live Mode: Using real API (${config.claude.defaultModel})\n`);
    console.log(`   💡 Tip: Use default mode to replay from snapshots (free, fast)\n`);
  } else {
    if (snapshotStats.count > 0) {
      console.log(`🎬 Replay Mode: Using ${snapshotStats.count} saved snapshots (free, fast, deterministic)\n`);
      console.log(`   💡 Tip: Use --record to update snapshots, --live to force real API\n`);
    } else {
      console.log(`⚠️  No snapshots found. Running with real API (will cost money).\n`);
      console.log(`   💡 Run 'npm run eval:record' first to record snapshots (one-time cost)\n`);
      process.env.USE_SNAPSHOTS = 'false'; // No snapshots, use real API
    }
  }

  // Get all scenario files
  const scenariosDir = path.join(__dirname, 'scenarios', 'definitions');
  const files = await fs.readdir(scenariosDir);
  const scenarioFiles = files.filter(f => f.endsWith('.json'));

  let filesToRun = scenarioFiles.map(f => path.join(scenariosDir, f));

  // Filter if specific scenario requested
  if (specificScenario) {
    filesToRun = filesToRun.filter(f => f.includes(specificScenario));
    if (filesToRun.length === 0) {
      console.error(`❌ Scenario "${specificScenario}" not found`);
      console.log('\nAvailable scenarios:');
      scenarioFiles.forEach(f => console.log(`   - ${f.replace('.json', '')}`));
      process.exit(1);
    }
  }

  console.log(`Running ${filesToRun.length} scenario(s)...\n`);

  const runner = new ScenarioRunner();

  // Run each scenario
  for (const scenarioPath of filesToRun) {
    try {
      const result = await runner.runScenario(scenarioPath);
      const costStr = result.cost !== undefined ? `, ~$${result.cost.toFixed(4)}` : '';
      console.log(`   ${result.passed ? '✅' : '❌'} ${result.scenario} (${result.steps} steps, ${result.duration}ms${costStr})\n`);
    } catch (error) {
      console.error(`   ❌ ${path.basename(scenarioPath)} - Error: ${error.message}\n`);
    }
  }

  // Generate final report
  const report = runner.generateReport();

  // Generate UI index
  console.log('Generating UI index...');
  const { execSync } = await import('child_process');
  execSync('node eval/lib/generate-ui-index.js', { stdio: 'inherit' });

  // Exit with error code if any scenarios failed
  if (report.failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
