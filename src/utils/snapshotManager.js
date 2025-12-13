import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Snapshot directory
const SNAPSHOT_DIR = path.join(__dirname, '../../eval/snapshots');

// Track snapshot usage for logging (global state for scenario runner to access)
let snapshotUsageLog = [];

export function getSnapshotUsageLog() {
  return snapshotUsageLog;
}

export function resetSnapshotUsageLog() {
  snapshotUsageLog = [];
}

/**
 * Generate a unique key for a snapshot based on prompt and options
 */
export function getSnapshotKey(prompt, systemPrompt = null, options = {}) {
  // Create a deterministic hash from prompt + systemPrompt + options
  const keyData = JSON.stringify({
    prompt,
    systemPrompt,
    model: options.model || 'default',
    maxTokens: options.maxTokens || 1024,
    temperature: options.temperature ?? 1.0,
  });
  
  // Use SHA-256 hash for consistent, short keys
  const hash = crypto.createHash('sha256').update(keyData).digest('hex');
  return hash.substring(0, 16); // Use first 16 chars (sufficient for uniqueness)
}

/**
 * Get snapshot file path
 */
function getSnapshotPath(key) {
  return path.join(SNAPSHOT_DIR, `${key}.json`);
}

/**
 * Check if snapshot exists
 */
export async function snapshotExists(key) {
  try {
    const snapshotPath = getSnapshotPath(key);
    await fs.access(snapshotPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load snapshot from file
 */
export async function loadSnapshot(key) {
  try {
    const snapshotPath = getSnapshotPath(key);
    const data = await fs.readFile(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(data);
    
    // Log snapshot usage (for scenario logs)
    const snapshotFileName = path.basename(snapshotPath);
    console.log(`   📸 Snapshot used: ${snapshotFileName} (key: ${key.substring(0, 8)}...)`);
    
    // Track for scenario log
    snapshotUsageLog.push({
      type: 'used',
      snapshotFile: snapshotFileName,
      key: key.substring(0, 8),
      timestamp: new Date(),
    });
    
    return snapshot.response;
  } catch (error) {
    throw new Error(`Failed to load snapshot ${key}: ${error.message}`);
  }
}

/**
 * Save snapshot to file
 */
export async function saveSnapshot(key, response, metadata = {}) {
  try {
    // Ensure snapshot directory exists
    await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
    
    const snapshotPath = getSnapshotPath(key);
    const snapshotFileName = path.basename(snapshotPath);
    const snapshot = {
      response,
      metadata: {
        ...metadata,
        recordedAt: new Date().toISOString(),
      },
    };
    
    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
    console.log(`   💾 Snapshot recorded: ${snapshotFileName} (key: ${key.substring(0, 8)}...)`);
  } catch (error) {
    console.error(`⚠️  Failed to save snapshot ${key}: ${error.message}`);
    throw error; // Re-throw so we know if saving fails
  }
}

/**
 * Check if we're in record mode
 */
export function isRecordMode() {
  return process.env.RECORD_SNAPSHOTS === 'true' || process.env.RECORD_SNAPSHOTS === '1';
}

/**
 * Check if we're in replay mode (use snapshots)
 */
export function isReplayMode() {
  // Default to replay mode unless explicitly disabled
  return process.env.USE_SNAPSHOTS !== 'false';
}

/**
 * Get snapshot statistics
 */
export async function getSnapshotStats() {
  try {
    const files = await fs.readdir(SNAPSHOT_DIR);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    return {
      count: jsonFiles.length,
      directory: SNAPSHOT_DIR,
    };
  } catch {
    return {
      count: 0,
      directory: SNAPSHOT_DIR,
    };
  }
}

