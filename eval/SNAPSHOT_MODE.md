# Snapshot-Based API Mocking

## Overview

Snapshot-based mocking records real API responses once, then replays them for all future test runs. This provides:
- **Free tests** after initial recording
- **Fast execution** (no API latency)
- **Deterministic results** (same every time)
- **Real behavior** (uses actual API responses, not guesses)

## How It Works

1. **Record Mode**: Run tests with real API, save all responses to `eval/snapshots/`
2. **Replay Mode**: Use saved snapshots instead of calling API
3. **Live Mode**: Force real API (bypass snapshots)

## Commands

### Record Snapshots (One-Time)
```bash
npm run eval:record
```
- Runs all scenarios with real API
- Saves all responses to `eval/snapshots/`
- Cost: ~$0.16-0.40 (one-time)
- Use when: First time setup, or when prompts change

### Replay from Snapshots (Default)
```bash
npm run eval
```
- Uses saved snapshots (no API calls)
- Cost: $0.00
- Fast: No API latency
- Use for: Daily development, CI/CD

### Force Real API
```bash
npm run eval:live
```
- Always uses real API (ignores snapshots)
- Cost: ~$0.02-0.05 per scenario
- Use when: Testing AI quality, validating prompts

## Snapshot Storage

- **Location**: `eval/snapshots/`
- **Format**: JSON files (one per unique prompt)
- **Key**: SHA-256 hash of (prompt + systemPrompt + options)
- **Size**: ~50-200KB per snapshot (depends on response length)

## When to Re-Record

Re-run `npm run eval:record` when:
- Prompts change significantly
- You want to update test expectations
- Snapshots seem stale or incorrect

## Benefits vs Old Mock System

| Feature | Old Pattern-Based | New Snapshot-Based |
|---------|------------------|-------------------|
| Code Complexity | ~200 lines of regex | ~100 lines of file I/O |
| Maintenance | High (constant tuning) | Low (re-record when needed) |
| Reliability | Low (guessing responses) | High (real API responses) |
| Setup Time | Hours of tuning | One recording run |
| Accuracy | ~60-80% | 100% (real responses) |

## Implementation Details

- **Snapshot Manager**: `src/utils/snapshotManager.js`
- **Integration**: `src/utils/claude.js` (replaces old mock system)
- **Commands**: `eval/run.js` (record/replay/live modes)

## Troubleshooting

**No snapshots found:**
- Run `npm run eval:record` first
- Check `eval/snapshots/` directory exists

**Snapshots seem stale:**
- Re-run `npm run eval:record` to update
- Delete `eval/snapshots/` and re-record

**Want to test with real API:**
- Use `npm run eval:live`
- Or set `USE_SNAPSHOTS=false`

