import { CitySim, STATIONS } from './sim.js';
import { $, fmt, lineChart } from './ui.js';
import traffic, { trafficSummary } from './modules/traffic.js';
import hospital from './modules/hospital.js';
import school from './modules/school.js';
import grocery from './modules/grocery.js';
import energy from './modules/energy.js';
import air from './modules/air.js';
import waste from './modules/waste.js';

const MODULES = [traffic, hospital, school, grocery, energy, air, waste];
const BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));
const sim = new CitySim();
window.sim = sim;

// ---------------------------------------------------------------- drawer ---
let cleanup = null;
function openModule(id) {
  const m = BY_ID[id]; if (!m) return;
  cleanup && cleanup();
  $('#drawer .ic').textContent = m.icon; $('#drawer h2').textContent = m.title; $('#drawer header p').textContent = m.desc;
  const body = $('#drawer .body'); body.innerHTML = '';
  $('#drawer').classList.add('on');
  cleanup = m.mount(body, sim);
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* sandboxed */ }
}
function closeModule() { $('#drawer').classList.remove('on'); cleanup && cleanup(); cleanup = null; try { history.replaceState(null, '', location.pathname); } catch (e) { /* */ } }
$('#drawer .x').onclick = closeModule; $('#drawer .scrim').onclick = closeModule;
addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModule(); });

// ------------------------------------------------------------------ tabs ---
let city = null;
document.querySelectorAll('.tab').forEach((t) => t.onclick = async () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === t.dataset.v));
  if (t.dataset.v === 'view3d') {
    if (!city) {
      const { createCity } = await import('./city3d.js');
      city = createCity($('#scene'), sim, openModule);
      $('#view3d').appendChild(city.vrButton);
    }
    city.pause(false);
  } else if (city) city.pause(true);
});
document.querySelectorAll('.speed button').forEach((b) => b.onclick = () => {
  sim.speed = +b.dataset.s; document.querySelectorAll('.speed button').forEach((x) => x.classList.toggle('on', x === b));
});

// ------------------------------------------------------------- dashboard ---
const kpiDefs = [
  ['traffic', 'التأخير في الإشارات', () => { const s = trafficSummary(sim); return [`${fmt(s.dA, 0)} ث`, `أقل ${fmt(100 * s.saving)}٪ من التوقيت الثابت`]; }],
  ['hospital', 'بانتظار الطوارئ', () => [fmt(sim.erQueue), `الطاقم: ${sim.erStaff}`]],
  ['school', 'قارئ الخط', () => ['0–9', 'شبكة عصبية في المتصفح']],
  ['grocery', 'مبيعات اليوم', () => [fmt(sim.salesToday), 'ريال']],
  ['energy', 'الطاقة الشمسية الآن', () => [`${fmt(sim.h.solar.at(-1))} MW`, `البطاريات ${fmt(sim.battery.soc * 100)}٪`]],
  ['air', 'أعلى AQI', () => { const v = sim.h.aqi.map((s) => s.at(-1)), mx = Math.max(...v); return [fmt(mx), STATIONS[v.indexOf(mx)].name]; }],
  ['waste', 'حاويات ممتلئة', () => [`${sim.bins.filter((b) => b.fill > 0.7).length}`, `من ${sim.bins.length} حاوية`]],
];
$('#kpis').innerHTML = kpiDefs.map(([id, t]) => `<div class="kpi" data-m="${id}" style="--c:${BY_ID[id].color}"><div class="t">${BY_ID[id].icon} ${t}</div><div class="v">–</div><div class="s">–</div></div>`).join('');
$('#kpis').onclick = (e) => { const k = e.target.closest('.kpi'); if (k) openModule(k.dataset.m); };

// district map (SVG)
const LAYOUT = [['hospital', 1, 1], ['school', 3, 1], ['grocery', 1, 3], ['energy', 3, 3], ['air', 2, 2], ['waste', 4, 4], ['traffic', 2, 5]];
function drawMap() {
  const S = 100, svg = [`<svg class="map" viewBox="-20 -20 540 640" xmlns="http://www.w3.org/2000/svg">`];
  svg.push('<rect x="-20" y="-20" width="540" height="640" fill="#0a1222"/>');
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) svg.push(`<rect x="${i * S + 8}" y="${j * S + 8}" width="${S - 16}" height="${S - 16}" rx="8" fill="#141f38"/>`);
  svg.push('<rect x="244" y="500" width="12" height="90" fill="#1b2744"/>');
  LAYOUT.forEach(([id, i, j]) => {
    const m = BY_ID[id], x = i * S + 8, y = j * S + 8;
    svg.push(`<g class="d" data-m="${id}"><rect x="${x}" y="${y}" width="${S - 16}" height="${S - 16}" rx="10" fill="${getComputedStyle(document.documentElement).getPropertyValue('--' + id)}" opacity=".9"/>
      <text x="${x + 42}" y="${y + 42}" font-size="30" text-anchor="middle">${m.icon}</text>
      <text x="${x + 42}" y="${y + 70}" font-size="13" text-anchor="middle" fill="#0a1020" font-weight="700">${m.title}</text></g>`);
  });
  svg.push('</svg>');
  $('#map').innerHTML = svg.join('');
  $('#map').onclick = (e) => { const g = e.target.closest('.d'); if (g) openModule(g.dataset.m); };
}
drawMap();

const trafficChart = lineChart($('#chT'), sim.h.t, [{ label: 'حركة المرور (كل التقاطعات)', data: [], borderColor: '#f2a531' }]);
const energyChart = lineChart($('#chE'), sim.h.t, [
  { label: 'الحمل', data: sim.h.load, borderColor: '#3fb6ff' }, { label: 'شمسي', data: sim.h.solar, borderColor: '#f5d04c' }]);
const SECT = { traffic: '🚦', hospital: '🏥', school: '🏫', grocery: '🛒', energy: '⚡', air: '🌫️', waste: '🗑️' };

function render() {
  $('#clock').innerHTML = `${sim.clock}<small>اليوم ${sim.day} · سرعة ×${sim.speed * 60}</small>`;
  document.querySelectorAll('.kpi').forEach((k, i) => { const [v, s] = kpiDefs[i][2](); k.querySelector('.v').textContent = v; k.querySelector('.s').textContent = s; });
  trafficChart.data.labels = sim.h.t; trafficChart.data.datasets[0].data = sim.h.traffic[0].map((_, i) => sim.h.traffic.reduce((a, s) => a + s[i], 0)); trafficChart.update();
  energyChart.data.labels = sim.h.t; energyChart.update();
  $('#feed').innerHTML = sim.events.slice(0, 25).map((e) => `<li><time>${e.t}</time><span>${SECT[e.sector] || ''}</span><span style="color:${e.level === 'warn' ? '#ffd07a' : 'inherit'}">${e.text}</span></li>`).join('')
    || '<li style="color:var(--muted)">النظام يراقب المدينة… التنبيهات تظهر هنا</li>';
}
sim.log('traffic', 'تشغيل نظام المدينة الذكية: كل الحساسات متصلة');
sim.on(render); render();

let last = performance.now();
setInterval(() => { const now = performance.now(); sim.tick((now - last) / 1000); last = now; }, 250);

const hash = location.hash.slice(1);
if (BY_ID[hash]) openModule(hash);

// 3D legend: fly to the building, then open its module
$('#legend').onclick = (e) => {
  const b = e.target.closest('button'); if (!b || !city) return;
  city.flyTo(b.dataset.m); setTimeout(() => openModule(b.dataset.m), 1100);
};
