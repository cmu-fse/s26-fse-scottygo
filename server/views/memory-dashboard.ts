/**
 * HTML template for the ScottyGo Memory Dashboard diagnostic page.
 * Served by HealthController at GET /transit/memory/dashboard.
 * Extracted from transit.controller.ts to allow UI changes without touching
 * the controller layer.
 */
import { memoryDashboardStyles } from './memory-dashboard.styles';
import { memoryDashboardScript } from './memory-dashboard.script';

export const memoryDashboardHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="icon" href="data:," />
  <title>ScottyGo Memory Dashboard</title>
  <style>${memoryDashboardStyles}</style>
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

  <script>${memoryDashboardScript}</script>
</body>
</html>`;
