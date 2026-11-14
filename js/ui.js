// Small helpers shared by the dashboard and the sector modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
export const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
export const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

Chart.defaults.color = '#8a97b4';
Chart.defaults.borderColor = '#1d2a47';
Chart.defaults.font.family = '"IBM Plex Sans Arabic", system-ui, sans-serif';
Chart.defaults.animation = false;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.legend.labels.boxWidth = 10;

export function lineChart(canvas, labels, datasets, opts = {}) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: datasets.map((d) => ({ pointRadius: 0, borderWidth: 2, tension: 0.3, ...d })) },
    options: {
      interaction: { mode: 'index', intersect: false },
      scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { beginAtZero: true, ...(opts.y || {}) } },
      plugins: { legend: { display: datasets.length > 1 } },
      ...opts.extra,
    },
  });
}

export function bars(el, items, color) {      // [{label, value(0..1), text}]
  el.innerHTML = items.map((it) => `
    <div class="bar"><span>${it.label}</span>
      <div class="track"><div class="fill" style="width:${Math.round(it.value * 100)}%;background:${it.color || color}"></div></div>
      <span style="font-family:IBM Plex Mono,monospace;text-align:end">${it.text}</span></div>`).join('');
}

export async function loadJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(path);
  return r.json();
}
