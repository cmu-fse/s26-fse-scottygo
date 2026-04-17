export const memoryDashboardScript = `
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
`;
