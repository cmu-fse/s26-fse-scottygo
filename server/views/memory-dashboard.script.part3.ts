export const memoryDashboardScriptPart3 = `
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
      throw new Error(
        'Memory endpoint request failed: ' +
          samplesRes.status +
          '/' +
          summaryRes.status
      );
    }

    const samplesJson = await samplesRes.json();
    const summaryJson = await summaryRes.json();
    const samplesDesc = Array.isArray(samplesJson.payload)
      ? samplesJson.payload
      : [];
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
    if (errorEl)
      errorEl.textContent = err && err.message ? err.message : String(err);
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

  if (statusEl)
    statusEl.textContent = 'CSV exported (' + latestSamples.length + ' rows)';
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
    if (statusEl)
      statusEl.textContent = 'Metric selected: ' + (action || 'unknown');
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
