#!/usr/bin/env node

/**
 * Voyaj Evaluation Framework
 *
 * Run all evaluation scenarios to test state transitions,
 * agent behavior, and conversation flows.
 *
 * Usage:
 *   npm run eval                    # Run all scenarios
 *   npm run eval scenario-name      # Run specific scenario
 *   npm run eval:inspect name       # Inspect scenario definition
 */

import { ScenarioRunner } from './lib/scenario-runner.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const args = process.argv.slice(2);
  const specificScenario = args[0];

  console.log('\n🧪 Voyaj Evaluation Framework\n');

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
      console.log(`   ${result.passed ? '✅' : '❌'} ${result.scenario} (${result.steps} steps, ${result.duration}ms)\n`);
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
