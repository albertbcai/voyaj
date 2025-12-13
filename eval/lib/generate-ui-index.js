/**
 * Generate scenarios.json for UI
 *
 * Creates an index of all scenario output files for the UI to load
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function generateUIIndex() {
  const outputDir = path.join(__dirname, '..', 'scenarios', 'output');
  const uiDir = path.join(__dirname, '..', 'ui');

  try {
    const files = await fs.readdir(outputDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));

    const indexPath = path.join(uiDir, 'scenarios.json');
    await fs.writeFile(indexPath, JSON.stringify(jsonFiles, null, 2));

    console.log(`✅ Generated UI index with ${jsonFiles.length} scenarios`);
  } catch (error) {
    console.error('Error generating UI index:', error);
  }
}

generateUIIndex();
