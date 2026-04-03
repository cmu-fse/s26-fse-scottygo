// Controller for PRT bus data endpoints
// Base path: /transit

import { Request, Response } from 'express';
import Controller from './controller';
import DAC, { IMemorySampleRecord } from '../db/dac';
import tripshotService from '../services/tripshot.service';
import vehiclePositionsService from '../services/vehicle-positions.service';
import tripUpdatesService from '../services/trip-updates.service';
import memoryMonitorService from '../services/memory-monitor.service';
import { TransitModel } from '../models/transit.model';
import gtfsService from '../services/gtfs.service';
import * as responses from '../../common/server.responses';
import { IRoute, IVehicle } from '../../common/transit.interface';

/**
 * Parse and clamp a numeric query-string value.
 * Returns `defaultLimit` when the input is undefined or not a finite number.
 * The result is always clamped to [1, maxLimit].
 */
export function parseLimit(
  rawLimit: string | undefined,
  defaultLimit: number,
  maxLimit: number
): number {
  const parsed = rawLimit ? Number.parseInt(rawLimit, 10) : defaultLimit;
  if (!Number.isFinite(parsed)) {
    return defaultLimit;
  }
  return Math.min(Math.max(parsed, 1), maxLimit);
}

export default class BusController extends Controller {
  private static readonly MEMORY_LIMIT_DEFAULT = 120;

  private static readonly MEMORY_LIMIT_MAX = 2000;

  private static readonly MEMORY_SUMMARY_LIMIT_DEFAULT = 720;

  private static readonly MEMORY_SUMMARY_LIMIT_MAX = 5000;

  public constructor(path: string) {
    super(path);
  }

  public initializeRoutes(): void {
    this.router.get('/health', this.getHealth.bind(this));
    this.router.get('/memory/samples', this.getMemorySamples.bind(this));
    this.router.get('/memory/summary', this.getMemorySummary.bind(this));
    this.router.get('/memory/dashboard', this.getMemoryDashboard.bind(this));
    this.router.get('/bulk', this.getBulkData.bind(this));
    this.router.get('/routes', this.getRoutes.bind(this));
    this.router.post(
      '/routes/available',
      this.filterRoutesByDateTime.bind(this)
    );
    this.router.get('/routes/:id', this.getPatterns.bind(this));
    this.router.get('/vehicles/:routeId', this.getVehicles.bind(this));
    this.router.get('/stops/nearbystops', this.getNearbyStops.bind(this));
    this.router.get('/stops/:routeId', this.getStops.bind(this));
    this.router.get(
      '/stops/:stopId/predictions',
      this.getPredictions.bind(this)
    );
    this.router.get(
      '/detours/:routeId/geometry',
      this.getDetourGeometry.bind(this)
    );
    this.router.get('/detours/:routeId', this.getDetours.bind(this));
  }

  // GET /transit/health — service health status for the frontend
  private getHealth(_req: Request, res: Response): void {
    const vehiclesHealthy = vehiclePositionsService.isHealthy();
    const tripsHealthy = tripUpdatesService.isHealthy();
    const colorsAvailable = TransitModel.colorsAvailable;

    const status = {
      memory: memoryMonitorService.getSummary(),
      vehiclePositions: {
        healthy: vehiclesHealthy,
        lastFetched:
          vehiclePositionsService.getLastFetched()?.toISOString() ?? null,
        consecutiveFailures: vehiclePositionsService.getConsecutiveFailures(),
        error: vehiclePositionsService.getLastError()
      },
      tripUpdates: {
        healthy: tripsHealthy,
        lastFetched: tripUpdatesService.getLastFetched()?.toISOString() ?? null,
        consecutiveFailures: tripUpdatesService.getConsecutiveFailures(),
        error: tripUpdatesService.getLastError()
      },
      trueTimeColors: {
        available: colorsAvailable
      },
      overall: vehiclesHealthy && tripsHealthy
    };

    res.status(200).json(status);
  }

  // GET /transit/memory/samples?limit=120
  private async getMemorySamples(req: Request, res: Response): Promise<void> {
    const limit = this.parseLimit(
      req.query.limit as string | undefined,
      BusController.MEMORY_LIMIT_DEFAULT,
      BusController.MEMORY_LIMIT_MAX
    );

    try {
      const samples = await DAC.db.getRecentMemorySamples(limit);
      res.status(200).json({
        name: 'MemorySamplesRetrieved',
        message: `Found ${samples.length} memory samples`,
        payload: samples
      });
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/memory/summary?limit=720
  private async getMemorySummary(req: Request, res: Response): Promise<void> {
    const limit = this.parseLimit(
      req.query.limit as string | undefined,
      BusController.MEMORY_SUMMARY_LIMIT_DEFAULT,
      BusController.MEMORY_SUMMARY_LIMIT_MAX
    );

    try {
      const samplesDesc = await DAC.db.getRecentMemorySamples(limit);
      const samples = [...samplesDesc].reverse();

      if (samples.length === 0) {
        res.status(200).json({
          name: 'MemorySummaryRetrieved',
          message: 'No memory samples available yet',
          payload: {
            sampleCount: 0,
            likelyCause: 'No data yet',
            recommendation:
              'Wait for at least a few monitor samples, then re-check this endpoint.'
          }
        });
        return;
      }

      const oldest = samples[0];
      const latest = samples[samples.length - 1];
      const maxRssSample = samples.reduce((max, s) =>
        s.rssMb > max.rssMb ? s : max
      );
      const maxHeapSample = samples.reduce((max, s) =>
        s.heapUsedMb > max.heapUsedMb ? s : max
      );

      const rssAvgMb =
        Math.round(
          (samples.reduce((sum, s) => sum + s.rssMb, 0) / samples.length) * 10
        ) / 10;

      const warningCount = samples.filter((s) => s.warning).length;
      const criticalCount = samples.filter((s) => s.critical).length;

      const reasonStats = new Map<
        string,
        { count: number; maxRssMb: number }
      >();
      for (const sample of samples) {
        const existing = reasonStats.get(sample.reason);
        if (!existing) {
          reasonStats.set(sample.reason, { count: 1, maxRssMb: sample.rssMb });
        } else {
          existing.count += 1;
          if (sample.rssMb > existing.maxRssMb) {
            existing.maxRssMb = sample.rssMb;
          }
        }
      }

      const reasonsByPeak = [...reasonStats.entries()]
        .map(([reason, stats]) => ({ reason, ...stats }))
        .sort((a, b) => b.maxRssMb - a.maxRssMb)
        .slice(0, 5);

      const oldestMs = new Date(oldest.timestamp).getTime();
      const latestMs = new Date(latest.timestamp).getTime();
      const minutes = Math.max((latestMs - oldestMs) / 60000, 0.001);
      const rssSlopeMbPerMin =
        Math.round(((latest.rssMb - oldest.rssMb) / minutes) * 10) / 10;

      const likelyCause =
        maxRssSample.reason === 'transit.refreshAllCaches.complete' ||
        maxRssSample.reason === 'gtfs.load.complete'
          ? 'GTFS static feed load/refresh is the dominant memory spike phase.'
          : maxRssSample.reason === 'interval'
            ? 'Steady-state growth indicates retained runtime memory under load.'
            : `Peak usage aligns with phase: ${maxRssSample.reason}`;

      const recommendation =
        maxRssSample.rssMb >= 460
          ? 'Reduce startup and refresh peak memory (e.g., lower heap cap, split/cache refresh work, and verify poller overlap guards).'
          : 'Monitor trend slope and critical counts; overflow may be tied to short-lived spikes during refresh windows.';

      res.status(200).json({
        name: 'MemorySummaryRetrieved',
        message: `Analyzed ${samples.length} memory samples`,
        payload: {
          sampleCount: samples.length,
          timeRange: {
            from: oldest.timestamp,
            to: latest.timestamp
          },
          rss: {
            latestMb: latest.rssMb,
            avgMb: rssAvgMb,
            maxMb: maxRssSample.rssMb,
            maxAt: maxRssSample.timestamp,
            maxReason: maxRssSample.reason,
            slopeMbPerMin: rssSlopeMbPerMin
          },
          heap: {
            latestUsedMb: latest.heapUsedMb,
            maxUsedMb: maxHeapSample.heapUsedMb,
            maxAt: maxHeapSample.timestamp,
            maxReason: maxHeapSample.reason
          },
          flags: {
            warningCount,
            criticalCount
          },
          likelyCause,
          recommendation,
          topReasonsByPeakRss: reasonsByPeak
        }
      });
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/memory/dashboard
  private getMemoryDashboard(_req: Request, res: Response): void {
    // This diagnostics page uses inline styles/scripts; set an explicit CSP so
    // hosted proxy defaults do not accidentally block rendering logic.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;"
    );
    res.setHeader('Cache-Control', 'no-store');

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>ScottyGo Memory Dashboard</title>
  <style>
    :root {
      --bg: #f4f8f8;
      --card: #ffffff;
      --text: #0d2f33;
      --muted: #4b6b70;
      --line1: #007f8c;
      --line2: #df5a49;
      --line3: #7a3e00;
      --warn: #c77d00;
      --crit: #b00020;
      --grid: #d6e4e6;
      --border: #d7e3e4;
    }

    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      color: var(--text);
      background: radial-gradient(circle at 20% 10%, #e2f3f3, transparent 40%),
                  radial-gradient(circle at 90% 0%, #ffe7e3, transparent 35%),
                  var(--bg);
      padding: 24px;
    }

    .wrap {
      max-width: 1200px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0, 40, 50, 0.06);
    }

    h1 {
      margin: 0;
      font-size: 1.35rem;
    }

    .subtitle {
      margin-top: 6px;
      color: var(--muted);
      font-size: 0.95rem;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    input, button {
      border-radius: 10px;
      border: 1px solid var(--border);
      padding: 8px 10px;
      font-size: 0.95rem;
    }

    button {
      background: #0d2f33;
      color: #fff;
      border-color: #0d2f33;
      cursor: pointer;
    }

    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
    }

    .metricButton {
      background: transparent;
      border: 0;
      text-align: left;
      padding: 0;
      margin: 0;
      width: 100%;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }

    .metric {
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
    }

    .metric.active {
      border-color: #0d2f33;
      box-shadow: 0 0 0 2px rgba(13, 47, 51, 0.14);
    }

    .metric .metricLabel {
      display: block;
      color: var(--muted);
      font-size: 0.82rem;
      margin-bottom: 4px;
    }

    .metric strong {
      font-size: 1.25rem;
    }

    .warn { color: var(--warn); }
    .crit { color: var(--crit); }

    canvas {
      width: 100%;
      height: 300px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: linear-gradient(to bottom, #ffffff, #f9fcfc);
    }

    .legend {
      display: flex;
      gap: 14px;
      font-size: 0.9rem;
      color: var(--muted);
      margin-top: 8px;
    }

    .dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 6px;
    }

    .error {
      color: var(--crit);
      white-space: pre-wrap;
    }

    .details {
      margin-top: 12px;
      border-top: 1px solid var(--border);
      padding-top: 12px;
    }

    .details h4 {
      margin: 0 0 10px 0;
    }

    .detailList {
      margin: 0;
      padding-left: 18px;
      color: var(--text);
      line-height: 1.45;
    }

    .tooltip {
      position: absolute;
      pointer-events: none;
      transform: translate(10px, -10px);
      background: #0d2f33;
      color: #fff;
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 0.82rem;
      display: none;
      z-index: 10;
      max-width: 320px;
      white-space: pre-line;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
    }

    .chartWrap {
      position: relative;
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>ScottyGo Memory Dashboard</h1>
      <div class="subtitle">Source: /transit/memory/samples and /transit/memory/summary</div>
    </div>

    <div class="card controls">
      <label>Sample limit <input id="limit" type="number" min="10" max="2000" value="720" /></label>
      <label>Auto-refresh seconds <input id="refresh" type="number" min="5" max="300" value="15" /></label>
      <button id="reload">Reload now</button>
      <button id="downloadCsv">Download CSV</button>
      <span id="status"></span>
    </div>

    <div class="card metrics" id="metrics"></div>

    <div class="card">
      <div class="chartWrap">
        <canvas id="chart" width="1100" height="300"></canvas>
        <div id="tooltip" class="tooltip"></div>
      </div>
      <div class="legend">
        <span><i class="dot" style="background: var(--line1)"></i>RSS (MB)</span>
        <span><i class="dot" style="background: var(--line2)"></i>Heap Used (MB)</span>
        <span><i class="dot" style="background: var(--line3)"></i>Render Free Limit (512MB)</span>
      </div>
      <div class="details" id="details">
        <h4>Key Data Drilldown</h4>
        <ul class="detailList" id="detailList">
          <li>Click <strong>RSS max</strong> or <strong>Criticals</strong> cards to inspect peak-related logs.</li>
          <li>Hover over the graph to view point-level memory sample details.</li>
        </ul>
      </div>
    </div>

    <div class="card">
      <h3>Likely Cause</h3>
      <div id="cause"></div>
      <h3>Recommendation</h3>
      <div id="recommendation"></div>
      <div class="error" id="error"></div>
    </div>
  </div>

  <script>
    const limitEl = document.getElementById('limit');
    const refreshEl = document.getElementById('refresh');
    const statusEl = document.getElementById('status');
    const metricsEl = document.getElementById('metrics');
    const causeEl = document.getElementById('cause');
    const recommendationEl = document.getElementById('recommendation');
    const errorEl = document.getElementById('error');
    const detailListEl = document.getElementById('detailList');
    const canvas = document.getElementById('chart');
    const tooltipEl = document.getElementById('tooltip');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

    window.addEventListener('error', (evt) => {
      if (!errorEl) return;
      const message = evt && evt.message ? evt.message : 'Unknown runtime error';
      errorEl.textContent = 'Runtime error: ' + message;
    });

    window.addEventListener('unhandledrejection', (evt) => {
      if (!errorEl) return;
      const reason = evt && evt.reason ? String(evt.reason) : 'Unknown promise rejection';
      errorEl.textContent = 'Unhandled promise rejection: ' + reason;
    });

    let timer = null;
    let latestSamples = [];
    let latestSummary = null;
    let chartPoints = [];

    function fmt(v) {
      return Number.isFinite(v) ? v.toFixed(1) : 'n/a';
    }

    function drawChart(samples) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!samples.length) {
        ctx.fillStyle = '#4b6b70';
        ctx.fillText('No samples yet', 10, 20);
        return;
      }

      const pad = 30;
      const w = canvas.width - pad * 2;
      const h = canvas.height - pad * 2;

      const rssValues = samples.map(s => s.rssMb);
      const heapValues = samples.map(s => s.heapUsedMb);
      const all = rssValues.concat(heapValues);
      const min = Math.min(...all);
      const max = Math.max(...all);
      const ySpan = Math.max(max - min, 1);

      ctx.strokeStyle = '#d6e4e6';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pad + (h * i / 4);
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(pad + w, y);
        ctx.stroke();
      }

      function toXY(idx, value) {
        const x = pad + (idx / Math.max(samples.length - 1, 1)) * w;
        const y = pad + h - ((value - min) / ySpan) * h;
        return [x, y];
      }

      function drawLine(values, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        values.forEach((v, i) => {
          const [x, y] = toXY(i, v);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
      }

      drawLine(rssValues, '#007f8c');
      drawLine(heapValues, '#df5a49');

      // Render free-tier memory limit reference line (512MB)
      const limit = 512;
      const yLimit = pad + h - ((limit - min) / ySpan) * h;
      if (yLimit >= pad && yLimit <= pad + h) {
        ctx.save();
        ctx.setLineDash([6, 5]);
        ctx.strokeStyle = '#7a3e00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pad, yLimit);
        ctx.lineTo(pad + w, yLimit);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = '#7a3e00';
        ctx.fillText('512 MB limit', pad + 6, Math.max(yLimit - 6, 12));
      }

      chartPoints = samples.map((s, i) => {
        const [xR, yR] = toXY(i, s.rssMb);
        const [xH, yH] = toXY(i, s.heapUsedMb);
        return { sample: s, x: xR, yRss: yR, yHeap: yH };
      });

      ctx.fillStyle = '#4b6b70';
      ctx.fillText('min ' + fmt(min) + ' MB', pad, 15);
      ctx.fillText('max ' + fmt(max) + ' MB', canvas.width - 120, 15);
    }

    function setDetailItems(items) {
      if (!detailListEl) return;
      if (!items.length) {
        detailListEl.innerHTML = '<li>No matching log data found.</li>';
        return;
      }

      detailListEl.innerHTML = items.map((s) =>
        '<li><strong>' + s.timestamp + '</strong> | reason: ' + s.reason +
        ' | rss: ' + fmt(s.rssMb) + ' MB | heap: ' + fmt(s.heapUsedMb) +
        ' MB | warning: ' + (s.warning ? 'yes' : 'no') +
        ' | critical: ' + (s.critical ? 'yes' : 'no') + '</li>'
      ).join('');
    }

    function showRssMaxDetails() {
      if (!latestSamples.length) {
        setDetailItems([]);
        return;
      }
      const max = latestSamples.reduce((best, s) => s.rssMb > best.rssMb ? s : best, latestSamples[0]);
      const around = latestSamples.filter((s) => {
        const delta = Math.abs(new Date(s.timestamp).getTime() - new Date(max.timestamp).getTime());
        return delta <= 2 * 60 * 1000;
      });
      setDetailItems(around.slice(-10).reverse());
    }

    function showRssLatestDetails() {
      if (!latestSamples.length) {
        setDetailItems([]);
        return;
      }
      setDetailItems([latestSamples[latestSamples.length - 1]]);
    }

    function showRssSlopeDetails() {
      if (latestSamples.length < 2) {
        setDetailItems([]);
        return;
      }

      const first = latestSamples[0];
      const last = latestSamples[latestSamples.length - 1];
      const oldestMs = new Date(first.timestamp).getTime();
      const latestMs = new Date(last.timestamp).getTime();
      const minutes = Math.max((latestMs - oldestMs) / 60000, 0.001);
      const slope = (last.rssMb - first.rssMb) / minutes;

      setDetailItems([
        {
          timestamp: last.timestamp,
          reason: 'rss.slope ' + fmt(slope) + ' MB/min from ' + first.timestamp,
          rssMb: last.rssMb,
          heapUsedMb: last.heapUsedMb,
          warning: last.warning,
          critical: last.critical
        }
      ]);
    }

    function showHeapLatestDetails() {
      if (!latestSamples.length) {
        setDetailItems([]);
        return;
      }
      setDetailItems([latestSamples[latestSamples.length - 1]]);
    }

    function showHeapMaxDetails() {
      if (!latestSamples.length) {
        setDetailItems([]);
        return;
      }
      const maxHeap = latestSamples.reduce((best, s) =>
        s.heapUsedMb > best.heapUsedMb ? s : best,
      latestSamples[0]);
      const around = latestSamples.filter((s) => {
        const delta = Math.abs(new Date(s.timestamp).getTime() - new Date(maxHeap.timestamp).getTime());
        return delta <= 2 * 60 * 1000;
      });
      setDetailItems(around.slice(-10).reverse());
    }

    function showCriticalDetails() {
      const criticals = latestSamples.filter((s) => s.critical).slice(-25).reverse();
      setDetailItems(criticals);
    }

    function showWarningDetails() {
      const warnings = latestSamples.filter((s) => s.warning).slice(-25).reverse();
      setDetailItems(warnings);
    }

    function runMetricAction(action) {
      if (action === 'rsslatest') showRssLatestDetails();
      if (action === 'rssmax') showRssMaxDetails();
      if (action === 'rssslope') showRssSlopeDetails();
      if (action === 'heaplatest') showHeapLatestDetails();
      if (action === 'heapmax') showHeapMaxDetails();
      if (action === 'warnings') showWarningDetails();
      if (action === 'criticals') showCriticalDetails();
    }

    function closestPoint(mouseX) {
      if (!chartPoints.length) return null;
      let best = chartPoints[0];
      let bestDist = Math.abs(mouseX - best.x);
      for (let i = 1; i < chartPoints.length; i++) {
        const d = Math.abs(mouseX - chartPoints[i].x);
        if (d < bestDist) {
          best = chartPoints[i];
          bestDist = d;
        }
      }
      return best;
    }

    if (canvas) canvas.addEventListener('mousemove', (evt) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * canvas.width;
      const point = closestPoint(x);
      if (!point) {
        if (tooltipEl) tooltipEl.style.display = 'none';
        return;
      }

      if (!tooltipEl) return;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = evt.clientX - rect.left + 'px';
      tooltipEl.style.top = evt.clientY - rect.top + 'px';
      const s = point.sample;
      tooltipEl.textContent =
        'time: ' + s.timestamp + '\\n' +
        'reason: ' + s.reason + '\\n' +
        'rss: ' + fmt(s.rssMb) + ' MB\\n' +
        'heap: ' + fmt(s.heapUsedMb) + ' MB\\n' +
        'warning: ' + (s.warning ? 'yes' : 'no') + '\\n' +
        'critical: ' + (s.critical ? 'yes' : 'no');
    });

    if (canvas) canvas.addEventListener('mouseleave', () => {
      if (tooltipEl) tooltipEl.style.display = 'none';
    });

    function setMetrics(summary) {
      if (!metricsEl) return;
      const rss = summary.payload?.rss || {};
      const heap = summary.payload?.heap || {};
      const flags = summary.payload?.flags || {};
      const metrics = [
        ['RSS latest', fmt(rss.latestMb) + ' MB', '', 'rsslatest'],
        ['RSS max', fmt(rss.maxMb) + ' MB', rss.maxMb >= 460 ? 'crit' : rss.maxMb >= 420 ? 'warn' : '', 'rssmax'],
        ['RSS slope', fmt(rss.slopeMbPerMin) + ' MB/min', '', 'rssslope'],
        ['Heap latest', fmt(heap.latestUsedMb) + ' MB', '', 'heaplatest'],
        ['Heap max', fmt(heap.maxUsedMb) + ' MB', '', 'heapmax'],
        ['Warnings', String(flags.warningCount ?? 0), 'warn', 'warnings'],
        ['Criticals', String(flags.criticalCount ?? 0), 'crit', 'criticals']
      ];

      metricsEl.innerHTML = metrics.map(([k, v, cls, action]) =>
        '<div class="metric"><button type="button" class="metricButton" data-action="' + action + '" aria-label="' + k + '"><span class="metricLabel">' + k + '</span><strong class="' + cls + '">' + v + '</strong></button></div>'
      ).join('');

      if (causeEl) causeEl.textContent = summary.payload?.likelyCause || 'n/a';
      if (recommendationEl) recommendationEl.textContent = summary.payload?.recommendation || 'n/a';
    }

    async function reload() {
      if (errorEl) errorEl.textContent = '';
      const limit = Math.max(10, Math.min(2000, Number(limitEl.value) || 720));
      if (statusEl) statusEl.textContent = 'Loading...';

      try {
        const [samplesRes, summaryRes] = await Promise.all([
          fetch('/transit/memory/samples?limit=' + limit),
          fetch('/transit/memory/summary?limit=' + limit)
        ]);

        if (!samplesRes.ok || !summaryRes.ok) {
          throw new Error('Memory endpoint request failed: ' + samplesRes.status + '/' + summaryRes.status);
        }

        const samplesJson = await samplesRes.json();
        const summaryJson = await summaryRes.json();
        const samplesDesc = Array.isArray(samplesJson.payload) ? samplesJson.payload : [];
        const samples = [...samplesDesc].reverse();
        latestSamples = samples;
        latestSummary = summaryJson;

        drawChart(samples);
        setMetrics(summaryJson);

        const t = new Date().toISOString();
        if (statusEl) statusEl.textContent = 'Updated ' + t;
      } catch (err) {
        if (statusEl) statusEl.textContent = 'Failed';
        drawChart([]);
        setMetrics({ payload: {} });
        if (errorEl) errorEl.textContent = (err && err.message) ? err.message : String(err);
      }
    }

    function restartTimer() {
      if (timer) window.clearInterval(timer);
      const sec = Math.max(5, Math.min(300, Number(refreshEl.value) || 15));
      timer = window.setInterval(reload, sec * 1000);
    }

    function downloadCsv() {
      if (!latestSamples.length) {
        if (statusEl) statusEl.textContent = 'No samples to export yet';
        return;
      }

      const headers = [
        'timestamp',
        'reason',
        'rssMb',
        'heapUsedMb',
        'heapTotalMb',
        'externalMb',
        'arrayBuffersMb',
        'uptimeSec',
        'peakRssMb',
        'peakHeapUsedMb',
        'warning',
        'critical'
      ];

      const escapeCell = (value) => {
        const text = value == null ? '' : String(value);
        return '"' + text.replace(/"/g, '""') + '"';
      };

      const rows = latestSamples.map((s) => [
        s.timestamp,
        s.reason,
        s.rssMb,
        s.heapUsedMb,
        s.heapTotalMb,
        s.externalMb,
        s.arrayBuffersMb,
        s.uptimeSec,
        s.peakRssMb,
        s.peakHeapUsedMb,
        s.warning,
        s.critical
      ]);

      const csv = [headers, ...rows]
        .map((row) => row.map(escapeCell).join(','))
        .join('\\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = 'scottygo-memory-samples-' + stamp + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      if (statusEl) statusEl.textContent = 'CSV exported (' + latestSamples.length + ' rows)';
    }

    const reloadBtn = document.getElementById('reload');
    const downloadBtn = document.getElementById('downloadCsv');
    if (metricsEl) {
      metricsEl.addEventListener('click', (evt) => {
        const target = evt.target;
        const button = target && target.closest ? target.closest('.metricButton') : null;
        if (!button) return;

        metricsEl.querySelectorAll('.metric').forEach((card) => {
          card.classList.remove('active');
        });

        const card = button.closest('.metric');
        if (card) card.classList.add('active');

        const action = button.getAttribute('data-action');
        runMetricAction(action);
        if (statusEl) statusEl.textContent = 'Metric selected: ' + (action || 'unknown');
      });
    }

    if (reloadBtn) reloadBtn.addEventListener('click', reload);
    if (downloadBtn) downloadBtn.addEventListener('click', downloadCsv);
    if (refreshEl) refreshEl.addEventListener('change', restartTimer);

    // Render placeholders immediately so dashboard is never visually empty.
    drawChart([]);
    setMetrics({ payload: {} });

    reload();
    restartTimer();
  </script>
</body>
</html>`;

    res.status(200).contentType('text/html').send(html);
  }

  private parseLimit(
    rawLimit: string | undefined,
    defaultLimit: number,
    maxLimit: number
  ): number {
    return parseLimit(rawLimit, defaultLimit, maxLimit);
  }

  // GET /transit/bulk — all routes, patterns, and stops in one response
  private async getBulkData(_req: Request, res: Response): Promise<void> {
    try {
      const bulk = await TransitModel.getAllTransitData();
      const successRes: responses.ISuccess = {
        name: 'BulkDataRetrieved',
        message: `All transit data: ${bulk.routes.length} routes`,
        payload: bulk
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/routes?system=PRT|CMU
  private async getRoutes(req: Request, res: Response): Promise<void> {
    const systemParam = req.query.system as string | undefined;

    try {
      const routes: IRoute[] = [];

      // Fetch PRT routes if no system filter or PRT is requested
      if (!systemParam || systemParam === 'PRT') {
        const prtRoutes = await TransitModel.getRoutes();
        routes.push(...prtRoutes);
      }

      // Fetch CMU routes if no system filter or CMU is requested
      if (!systemParam || systemParam === 'CMU') {
        if (tripshotService.isConfigured()) {
          const cmuRoutes = await tripshotService.getRoutes();
          routes.push(...cmuRoutes);
        } else {
          console.warn(
            `[Tripshot ${new Date().toISOString()}] Service not configured, skipping CMU routes`
          );
        }
      }

      const successRes: responses.ISuccess = {
        name: 'RoutesRetrieved',
        message: `Found ${routes.length} routes`,
        payload: routes
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // POST /transit/routes/available
  // Body: { date: string (YYYY-MM-DD), time?: string (HH:MM) }
  private async filterRoutesByDateTime(
    req: Request,
    res: Response
  ): Promise<void> {
    const { date, time } = req.body as { date?: string; time?: string };

    if (!date) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'Request body must include "date" (YYYY-MM-DD)'
      };
      res.status(400).json(errorRes);
      return;
    }

    try {
      const routes = time
        ? gtfsService.filterRoutesByDateTime(new Date(date), time)
        : gtfsService.filterRoutesByDate(new Date(date));

      const successRes: responses.ISuccess = {
        name: 'RoutesRetrieved',
        message: `Found ${routes.length} routes`,
        payload: routes
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/routes/:id
  private async getPatterns(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    try {
      let patterns = null;

      // Check if this is a CMU route
      if (id.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          patterns = await tripshotService.getPatterns(id).catch(() => null);
        } else {
          const err: responses.IAppError = {
            type: 'ServerError',
            name: 'ServiceUnavailable',
            message: 'CMU Shuttle tracking service not configured'
          };
          res.status(451).json(err);
          return;
        }
      } else {
        // PRT route — served from GTFS cache in MongoDB
        patterns = await TransitModel.getPatterns(id);
      }

      if (!patterns || patterns.length === 0) {
        const err: responses.IAppError = {
          type: 'ClientError',
          name: 'RouteNotFound',
          message: `No geometry found for route ${id}`
        };
        res.status(404).json(err);
        return;
      }

      const successRes: responses.ISuccess = {
        name: 'PathGenerated',
        message: `Found ${patterns.length} patterns for route ${id}`,
        payload: patterns
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/stops/nearbystops?lat=...&lon=...&radiusMeters=...
  private async getNearbyStops(req: Request, res: Response): Promise<void> {
    const latStr = req.query.lat as string | undefined;
    const lonStr = req.query.lon as string | undefined;

    if (!latStr || !lonStr) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'Query parameters "lat" and "lon" are required'
      };
      res.status(400).json(errorRes);
      return;
    }

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180
    ) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'OutOfBounds',
        message:
          'Coordinates out of valid range (lat: -90 to 90, lon: -180 to 180)'
      };
      res.status(400).json(errorRes);
      return;
    }

    // Default radius: 1000 m (~15 min walk); override via query param
    const radiusMeters = req.query.radiusMeters
      ? parseInt(req.query.radiusMeters as string, 10)
      : undefined; // let the model apply its own default

    // includeRoutes defaults to true per REST spec
    const includeRoutesParam = req.query.includeRoutes as string | undefined;
    const includeRoutes =
      includeRoutesParam === undefined || includeRoutesParam !== 'false';

    const filters: {
      routeId?: string;
      system?: string;
      direction?: string;
      date?: string;
      time?: string;
      includeRoutes?: boolean;
    } = { includeRoutes };

    if (req.query.routeId) filters.routeId = req.query.routeId as string;
    if (req.query.system) filters.system = req.query.system as string;
    if (req.query.direction)
      filters.direction = (req.query.direction as string).toUpperCase();
    if (req.query.date) filters.date = req.query.date as string;
    if (req.query.time) filters.time = req.query.time as string;

    try {
      const payload = await TransitModel.getNearbyStops(
        lat,
        lon,
        radiusMeters,
        filters
      );

      const successRes: responses.ISuccess = {
        name: 'NearbyStopsRetrieved',
        message: `Found ${payload.stops.length} nearby stops within ${payload.radiusMeters}m`,
        payload
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/stops/:routeId?dir=INBOUND|OUTBOUND
  private async getStops(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    const direction = (req.query.dir as string | undefined)?.toUpperCase();

    if (!direction) {
      const errorRes: responses.IAppError = {
        type: 'ClientError',
        name: 'MissingParameter',
        message: 'Query parameter "dir" is required (INBOUND or OUTBOUND)'
      };
      res.status(400).json(errorRes);
      return;
    }

    try {
      let stops = null;

      // Check if this is a CMU route
      if (routeId.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          stops = await tripshotService
            .getStops(routeId, direction)
            .catch(() => null);
        }
      } else {
        // PRT route — served from GTFS cache in MongoDB
        stops = await TransitModel.getStops(routeId, direction);
      }

      if (!stops || stops.length === 0) {
        const err: responses.IAppError = {
          type: 'ClientError',
          name: 'StopNotFound',
          message: `No stops found for route ${routeId}`
        };
        res.status(404).json(err);
        return;
      }

      const successRes: responses.ISuccess = {
        name: 'StopsRetrieved',
        message: `Found ${stops.length} stops for route ${routeId} ${direction}`,
        payload: stops
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/vehicles/:routeId
  private async getVehicles(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    try {
      let vehicles: IVehicle[] = [];

      // Check if this is a CMU route
      if (routeId.startsWith('CMU-')) {
        if (tripshotService.isConfigured()) {
          vehicles = await tripshotService.getVehicles(routeId);
        }
      } else {
        // PRT route — read from the in-memory GTFS-RT store (updated every 30s)
        vehicles = vehiclePositionsService.getVehicles(routeId);
      }

      const successRes: responses.ISuccess = {
        name: 'VehiclesLocated',
        message: `Found ${vehicles.length} vehicles on route ${routeId}`,
        payload: vehicles
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/stops/:stopId/predictions
  private getPredictions(req: Request, res: Response): void {
    const { stopId } = req.params;
    try {
      const predictions = tripUpdatesService.getPredictions(stopId);
      const successRes: responses.ISuccess = {
        name: 'PredictionsRetrieved',
        message: `Found ${predictions.length} predictions for stop ${stopId}`,
        payload: predictions
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/detours/:routeId
  private async getDetours(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    try {
      const detours = await TransitModel.getDetours([routeId]);
      const successRes: responses.ISuccess = {
        name: 'DetoursRetrieved',
        message: `Found ${detours.length} detours for route ${routeId}`,
        payload: detours
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // GET /transit/detours/:routeId/geometry
  private async getDetourGeometry(req: Request, res: Response): Promise<void> {
    const { routeId } = req.params;
    try {
      const detours = await TransitModel.getDetoursWithGeometry(routeId);
      const withGeometry = detours.filter((d) => (d.geometry?.length ?? 0) > 0);

      const successRes: responses.ISuccess = {
        name: 'DetoursRetrieved',
        message: `Found geometry for ${withGeometry.length} detours on route ${routeId}`,
        payload: withGeometry
      };
      res.status(200).json(successRes);
    } catch (error: unknown) {
      this.handleError(error, res);
    }
  }

  // -------------------------------------------------------------------------

  private handleError(error: unknown, res: Response): void {
    // Log the actual error for debugging
    console.error(
      `[Transit Controller ${new Date().toISOString()}] Error:`,
      error
    );

    if (
      error &&
      typeof error === 'object' &&
      'type' in error &&
      'name' in error &&
      'message' in error
    ) {
      const appError = error as responses.IAppError;
      const status =
        appError.type === 'ClientError'
          ? appError.name === 'RouteNotFound' ||
            appError.name === 'StopNotFound'
            ? 404
            : 400
          : 500;
      res.status(status).json(appError);
      return;
    }

    // Handle generic Error instances
    if (error instanceof Error) {
      console.error(
        `[Transit Controller ${new Date().toISOString()}] Unexpected Error:`,
        error.message,
        error.stack
      );
    }

    const serverError: responses.IAppError = {
      type: 'ServerError',
      name: 'GetRequestFailure',
      message:
        error instanceof Error ? error.message : 'An unexpected error occurred'
    };
    res.status(500).json(serverError);
  }
}
