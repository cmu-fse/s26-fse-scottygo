export const memoryDashboardScriptPart2 = `
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
  const maxHeap = latestSamples.reduce(
    (best, s) => (s.heapUsedMb > best.heapUsedMb ? s : best),
    latestSamples[0]
  );
  const around = latestSamples.filter((s) => {
    const delta = Math.abs(
      new Date(s.timestamp).getTime() - new Date(maxHeap.timestamp).getTime()
    );
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

if (canvas)
  canvas.addEventListener('mousemove', (evt) => {
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
      'time: ' +
      s.timestamp +
      '\\n' +
      'reason: ' +
      s.reason +
      '\\n' +
      'rss: ' +
      fmt(s.rssMb) +
      ' MB\\n' +
      'heap: ' +
      fmt(s.heapUsedMb) +
      ' MB\\n' +
      'warning: ' +
      (s.warning ? 'yes' : 'no') +
      '\\n' +
      'critical: ' +
      (s.critical ? 'yes' : 'no');
  });

if (canvas)
  canvas.addEventListener('mouseleave', () => {
    if (tooltipEl) tooltipEl.style.display = 'none';
  });

function setMetrics(summary) {
  if (!metricsEl) return;
  const rss = summary.payload?.rss || {};
  const heap = summary.payload?.heap || {};
  const flags = summary.payload?.flags || {};
  const metrics = [
    ['RSS latest', fmt(rss.latestMb) + ' MB', '', 'rsslatest'],
    [
      'RSS max',
      fmt(rss.maxMb) + ' MB',
      rss.maxMb >= 460 ? 'crit' : rss.maxMb >= 420 ? 'warn' : '',
      'rssmax'
    ],
    ['RSS slope', fmt(rss.slopeMbPerMin) + ' MB/min', '', 'rssslope'],
    ['Heap latest', fmt(heap.latestUsedMb) + ' MB', '', 'heaplatest'],
    ['Heap max', fmt(heap.maxUsedMb) + ' MB', '', 'heapmax'],
    ['Warnings', String(flags.warningCount ?? 0), 'warn', 'warnings'],
    ['Criticals', String(flags.criticalCount ?? 0), 'crit', 'criticals']
  ];

  metricsEl.innerHTML = metrics
    .map(
      ([k, v, cls, action]) =>
        '<div class="metric"><button type="button" class="metricButton" data-action="' +
        action +
        '" aria-label="' +
        k +
        '"><span class="metricLabel">' +
        k +
        '</span><strong class="' +
        cls +
        '">' +
        v +
        '</strong></button></div>'
    )
    .join('');

  if (causeEl) causeEl.textContent = summary.payload?.likelyCause || 'n/a';
  if (recommendationEl)
    recommendationEl.textContent = summary.payload?.recommendation || 'n/a';
}
`;
