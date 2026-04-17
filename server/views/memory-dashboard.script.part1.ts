export const memoryDashboardScriptPart1 = `
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

  const rssValues = samples.map((s) => s.rssMb);
  const heapValues = samples.map((s) => s.heapUsedMb);
  const all = rssValues.concat(heapValues);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const ySpan = Math.max(max - min, 1);

  ctx.strokeStyle = '#d6e4e6';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (h * i) / 4;
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

  detailListEl.innerHTML = items
    .map(
      (s) =>
        '<li><strong>' +
        s.timestamp +
        '</strong> | reason: ' +
        s.reason +
        ' | rss: ' +
        fmt(s.rssMb) +
        ' MB | heap: ' +
        fmt(s.heapUsedMb) +
        ' MB | warning: ' +
        (s.warning ? 'yes' : 'no') +
        ' | critical: ' +
        (s.critical ? 'yes' : 'no') +
        '</li>'
    )
    .join('');
}

function showRssMaxDetails() {
  if (!latestSamples.length) {
    setDetailItems([]);
    return;
  }
  const max = latestSamples.reduce(
    (best, s) => (s.rssMb > best.rssMb ? s : best),
    latestSamples[0]
  );
  const around = latestSamples.filter((s) => {
    const delta = Math.abs(
      new Date(s.timestamp).getTime() - new Date(max.timestamp).getTime()
    );
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
`;
