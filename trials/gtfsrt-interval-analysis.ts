/**
 * GTFS-RT Feed Update Interval Analyzer
 *
 * Polls both GTFS-RT feeds (vehicles + trips) every 5 seconds for 30 minutes,
 * detects when the feed content actually changes, and prints statistics about
 * the real update intervals.
 *
 *   npx ts-node trials/gtfsrt-interval-analysis.ts
 *
 * Optional flags:
 *   --duration <minutes>   Duration to run (default: 30)
 *   --poll <seconds>       Polling frequency (default: 5)
 */

import { createHash } from 'crypto';

// ── Configuration ──────────────────────────────────────────────────────

const VEHICLE_URL = 'https://truetime.portauthority.org/gtfsrt-bus/vehicles';
const TRIPS_URL = 'https://truetime.portauthority.org/gtfsrt-bus/trips';

// Parse CLI args
const args = process.argv.slice(2);
function argVal(flag: string, fallback: number): number {
  const idx = args.indexOf(flag);
  return idx >= 0 && args[idx + 1] ? Number(args[idx + 1]) : fallback;
}

const DURATION_MIN = argVal('--duration', 30);
const POLL_SEC = argVal('--poll', 5);
const DURATION_MS = DURATION_MIN * 60 * 1000;
const POLL_MS = POLL_SEC * 1000;

// ── Types ──────────────────────────────────────────────────────────────

interface FeedSample {
  timestamp: Date; // when we fetched
  hash: string; // SHA-256 of raw bytes
  byteLength: number; // payload size
  changed: boolean; // true if hash differs from previous
  feedTimestamp?: number; // GTFS-RT header.timestamp (Unix seconds) if parseable
}

interface FeedLog {
  name: string;
  url: string;
  samples: FeedSample[];
  changeIntervals: number[]; // seconds between consecutive changes
  errors: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function sha256(buf: ArrayBuffer): string {
  return createHash('sha256').update(Buffer.from(buf)).digest('hex');
}

/**
 * Attempt to read the GTFS-RT FeedMessage header.timestamp from the raw
 * protobuf without importing the full bindings.  The timestamp lives at
 * field 2 → sub-field 1 in the FeedHeader, but rather than hand-roll a
 * protobuf parser we just look for it with the bindings.
 */
let decodeFeed:
  | ((buf: Uint8Array) => { header?: { timestamp?: number | Long } })
  | null = null;
type Long = { toNumber(): number };

async function loadDecoder(): Promise<void> {
  try {
    const { transit_realtime } = await import('gtfs-realtime-bindings');
    decodeFeed = (buf: Uint8Array) =>
      transit_realtime.FeedMessage.decode(buf) as unknown as {
        header?: { timestamp?: number | Long };
      };
  } catch {
    console.warn(
      '[warn] gtfs-realtime-bindings not available — feed timestamps will not be extracted'
    );
  }
}

function extractFeedTimestamp(buf: ArrayBuffer): number | undefined {
  if (!decodeFeed) return undefined;
  try {
    const msg = decodeFeed(new Uint8Array(buf));
    const ts = msg.header?.timestamp;
    if (ts == null) return undefined;
    return typeof ts === 'number' ? ts : ts.toNumber();
  } catch {
    return undefined;
  }
}

async function fetchFeed(
  url: string
): Promise<{ buf: ArrayBuffer } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/x-protobuf' },
      signal: AbortSignal.timeout(10_000)
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { buf: await res.arrayBuffer() };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Sampling ───────────────────────────────────────────────────────────

async function sampleFeed(log: FeedLog): Promise<void> {
  const result = await fetchFeed(log.url);

  if ('error' in result) {
    log.errors++;
    console.error(`  [${log.name}] fetch error: ${result.error}`);
    return;
  }

  const hash = sha256(result.buf);
  const prevSample =
    log.samples.length > 0 ? log.samples[log.samples.length - 1] : null;
  const changed = prevSample ? hash !== prevSample.hash : true;
  const feedTimestamp = extractFeedTimestamp(result.buf);

  const sample: FeedSample = {
    timestamp: new Date(),
    hash,
    byteLength: result.buf.byteLength,
    changed,
    feedTimestamp
  };
  log.samples.push(sample);

  if (changed && prevSample) {
    const intervalSec =
      (sample.timestamp.getTime() - prevSample.timestamp.getTime()) / 1000;
    // Walk back to find the last *change* timestamp (not just the last sample)
    let lastChangeTime = prevSample.timestamp;
    for (let i = log.samples.length - 2; i >= 0; i--) {
      if (log.samples[i].changed) {
        lastChangeTime = log.samples[i].timestamp;
        break;
      }
    }
    const changeIntervalSec =
      (sample.timestamp.getTime() - lastChangeTime.getTime()) / 1000;
    log.changeIntervals.push(changeIntervalSec);
  }
}

// ── Analysis ───────────────────────────────────────────────────────────

function analyzeAndPrint(log: FeedLog): void {
  const total = log.samples.length;
  const changes = log.samples.filter((s) => s.changed).length;
  const intervals = log.changeIntervals;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${log.name}`);
  console.log(`  ${log.url}`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total samples:      ${total}`);
  console.log(`  Fetch errors:       ${log.errors}`);
  console.log(`  Content changes:    ${changes}`);
  console.log(`  Unchanged polls:    ${total - changes}`);

  if (intervals.length === 0) {
    console.log('  (not enough data to compute intervals)');
    return;
  }

  intervals.sort((a, b) => a - b);
  const min = intervals[0];
  const max = intervals[intervals.length - 1];
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const median =
    intervals.length % 2 === 0
      ? (intervals[intervals.length / 2 - 1] +
          intervals[intervals.length / 2]) /
        2
      : intervals[Math.floor(intervals.length / 2)];
  const stddev = Math.sqrt(
    intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / intervals.length
  );

  console.log(`\n  Update interval statistics (seconds):`);
  console.log(`    Min:      ${min.toFixed(1)}`);
  console.log(`    Max:      ${max.toFixed(1)}`);
  console.log(`    Mean:     ${mean.toFixed(1)}`);
  console.log(`    Median:   ${median.toFixed(1)}`);
  console.log(`    Std Dev:  ${stddev.toFixed(1)}`);

  // Histogram (10-second buckets)
  const bucketSize = 10;
  const buckets = new Map<number, number>();
  for (const v of intervals) {
    const bucket = Math.floor(v / bucketSize) * bucketSize;
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
  const maxCount = Math.max(...sortedBuckets.map(([, c]) => c));
  const barWidth = 30;

  console.log(`\n  Distribution (${bucketSize}s buckets):`);
  for (const [bucket, count] of sortedBuckets) {
    const bar = '█'.repeat(Math.round((count / maxCount) * barWidth));
    const label = `${bucket}-${bucket + bucketSize}s`.padEnd(10);
    console.log(`    ${label} ${bar} ${count}`);
  }

  // Feed-internal timestamps (if available)
  const feedTimestamps = log.samples
    .filter((s) => s.changed && s.feedTimestamp != null)
    .map((s) => s.feedTimestamp!);

  if (feedTimestamps.length > 1) {
    const feedIntervals: number[] = [];
    for (let i = 1; i < feedTimestamps.length; i++) {
      feedIntervals.push(feedTimestamps[i] - feedTimestamps[i - 1]);
    }
    feedIntervals.sort((a, b) => a - b);
    const fMin = feedIntervals[0];
    const fMax = feedIntervals[feedIntervals.length - 1];
    const fMean =
      feedIntervals.reduce((a, b) => a + b, 0) / feedIntervals.length;

    console.log(`\n  Feed-internal header.timestamp intervals (seconds):`);
    console.log(`    Min:      ${fMin}`);
    console.log(`    Max:      ${fMax}`);
    console.log(`    Mean:     ${fMean.toFixed(1)}`);
    console.log(`    (This is how often PRT actually regenerates the feed)`);
  }

  // Raw change log
  console.log(`\n  Change log (first 20):`);
  const changeSamples = log.samples.filter((s) => s.changed).slice(0, 20);
  for (const s of changeSamples) {
    const ts = s.timestamp.toISOString().substring(11, 19);
    const feedTs = s.feedTimestamp
      ? new Date(s.feedTimestamp * 1000).toISOString().substring(11, 19)
      : '??';
    console.log(
      `    ${ts}  feedTs=${feedTs}  size=${s.byteLength} bytes  hash=…${s.hash.substring(0, 12)}`
    );
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('┌──────────────────────────────────────────────────────────┐');
  console.log('│  GTFS-RT Feed Update Interval Analyzer                  │');
  console.log('│                                                         │');
  console.log(
    `│  Duration: ${String(DURATION_MIN).padEnd(4)} minutes                              │`
  );
  console.log(
    `│  Polling:  every ${String(POLL_SEC).padEnd(3)} seconds                            │`
  );
  console.log(
    `│  Expected samples: ~${String(Math.floor(DURATION_MS / POLL_MS)).padEnd(5)}                              │`
  );
  console.log('└──────────────────────────────────────────────────────────┘');
  console.log();

  await loadDecoder();

  const vehicleLog: FeedLog = {
    name: 'Vehicle Positions',
    url: VEHICLE_URL,
    samples: [],
    changeIntervals: [],
    errors: 0
  };

  const tripLog: FeedLog = {
    name: 'Trip Updates',
    url: TRIPS_URL,
    samples: [],
    changeIntervals: [],
    errors: 0
  };

  const startTime = Date.now();
  let sampleCount = 0;

  console.log(`[${new Date().toISOString()}] Starting data collection...\n`);

  // Run the collection loop
  while (Date.now() - startTime < DURATION_MS) {
    sampleCount++;
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const vChanges = vehicleLog.samples.filter((s) => s.changed).length;
    const tChanges = tripLog.samples.filter((s) => s.changed).length;

    process.stdout.write(
      `\r  Sample #${sampleCount} | ${elapsed}/${DURATION_MIN} min | ` +
        `vehicles: ${vChanges} changes | trips: ${tChanges} changes`
    );

    // Fetch both feeds in parallel
    await Promise.all([sampleFeed(vehicleLog), sampleFeed(tripLog)]);

    // Wait for next poll (subtract time spent fetching)
    const nextPoll = POLL_MS - ((Date.now() - startTime) % POLL_MS);
    if (Date.now() - startTime + nextPoll < DURATION_MS) {
      await new Promise((resolve) => setTimeout(resolve, nextPoll));
    }
  }

  console.log(`\n\n[${new Date().toISOString()}] Collection complete.\n`);

  // ── Print results ──
  analyzeAndPrint(vehicleLog);
  analyzeAndPrint(tripLog);

  // ── Summary comparison ──
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  COMPARISON');
  console.log(`${'═'.repeat(60)}`);
  const vMean =
    vehicleLog.changeIntervals.length > 0
      ? vehicleLog.changeIntervals.reduce((a, b) => a + b, 0) /
        vehicleLog.changeIntervals.length
      : 0;
  const tMean =
    tripLog.changeIntervals.length > 0
      ? tripLog.changeIntervals.reduce((a, b) => a + b, 0) /
        tripLog.changeIntervals.length
      : 0;

  console.log(`  Vehicle feed avg update interval: ${vMean.toFixed(1)}s`);
  console.log(`  Trip feed avg update interval:    ${tMean.toFixed(1)}s`);
  console.log();

  if (vMean > 0) {
    const optimalPoll = Math.max(5, Math.floor(vMean * 0.8));
    console.log(`  Suggested server poll interval: ${optimalPoll}s`);
    console.log(
      `    (80% of the average vehicle update interval, floored at 5s)`
    );
  }

  console.log();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
