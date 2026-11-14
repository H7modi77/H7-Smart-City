// 🚦 Traffic: adaptive signal timing with Webster's method + link to Saudi-ANPR gate.
import { INTERSECTIONS } from '../sim.js';
import { fmt, lineChart } from '../ui.js';

const SAT = 3600;      // saturation flow, veh/h for a 2-lane approach
const LOST = 8;        // lost time per cycle (2 phases x 4 s)

// Webster (1958): optimal cycle and green split for a 2-phase junction
export function webster(qNS, qEW) {
  const yN = qNS / SAT, yE = qEW / SAT, Y = Math.min(0.92, yN + yE);
  const C = Math.min(150, Math.max(40, (1.5 * LOST + 5) / (1 - Y)));
  const g = C - LOST;
  return { C, gNS: g * yN / (yN + yE), gEW: g * yE / (yN + yE) };
}
// Webster average delay per vehicle (s) for one approach
export function delay(q, g, C) {
  const lam = g / C, x = Math.min(0.97, q / (SAT * lam));
  const qs = q / 3600;
  return (C * (1 - lam) ** 2) / (2 * (1 - lam * x)) + (x * x) / (2 * qs * (1 - x));
}
function junction(q, split) {
  const qNS = q * split, qEW = q * (1 - split);
  const fixed = { C: 90, gNS: 41, gEW: 41 };
  const ai = webster(qNS, qEW);
  const d = (t) => (qNS * delay(qNS, t.gNS, t.C) + qEW * delay(qEW, t.gEW, t.C)) / (qNS + qEW);
  return { qNS, qEW, fixed, ai, dFixed: d(fixed), dAi: d(ai) };
}
const SPLITS = [0.62, 0.48, 0.56, 0.4];

export function trafficSummary(sim) {
  const js = INTERSECTIONS.map((it, i) => junction(sim.h.traffic[i].at(-1), SPLITS[i]));
  const tot = js.reduce((a, j) => a + j.qNS + j.qEW, 0);
  const dF = js.reduce((a, j) => a + j.dFixed * (j.qNS + j.qEW), 0) / tot;
  const dA = js.reduce((a, j) => a + j.dAi * (j.qNS + j.qEW), 0) / tot;
  return { js, tot, dF, dA, saving: 1 - dA / dF };
}

export default {
  id: 'traffic', icon: '🚦', title: 'إدارة المرور', color: 'var(--traffic)',
  desc: 'إشارات ذكية تعدّل توقيتها حسب الزحمة + بوابة قراءة اللوحات',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Webster optimisation</span><span class="tag">Saudi-ANPR</span>
      <div class="row" id="st"></div>
      <div class="card" style="margin-top:12px"><h3>توقيت الإشارات الآن <span class="hint">ثابت (90 ث) مقابل الذكي</span></h3>
        <table class="t"><thead><tr><th>التقاطع</th><th>سيارة/ساعة</th><th>الدورة</th><th>أخضر شمال-جنوب</th><th>أخضر شرق-غرب</th><th>التأخير: ثابت ← ذكي</th></tr></thead><tbody id="tb"></tbody></table>
      </div>
      <div class="card" style="margin-top:12px"><h3>حجم الحركة آخر 24 ساعة</h3><div class="chartbox"><canvas id="ch"></canvas></div></div>
      <div class="card" style="margin-top:12px">
        <h3>🚗 بوابة دخول المدينة: قراءة اللوحات السعودية</h3>
        <p style="margin:0 0 10px;font-size:14px;color:var(--muted)">البوابة تستخدم مشروع <b>Saudi-ANPR</b>: يكتشف اللوحة ويقرأ الصف العربي والإنجليزي ويطابقهما (دقة 94٪ على بيانات الاختبار).</p>
        <a class="btn" href="https://h7modi77.github.io/Saudi-ANPR/web/" target="_blank" rel="noopener">افتح بوابة قراءة اللوحات ↗</a>
      </div>
      <p class="note">التأخير محسوب بمعادلة Webster لكل اتجاه. النظام الذكي يحسب الدورة المثلى C₀ = (1.5L+5)/(1−Y) ويوزّع الأخضر حسب نسبة الزحمة في كل اتجاه.</p>`;
    const chart = lineChart(el.querySelector('#ch'), sim.h.t, INTERSECTIONS.map((it, i) => ({
      label: it.name, data: sim.h.traffic[i], borderColor: ['#f2a531', '#3fb6ff', '#22c37f', '#a98bff'][i] })));
    const draw = () => {
      const s = trafficSummary(sim);
      el.querySelector('#st').innerHTML = `
        <div class="stat"><div class="t">متوسط التأخير (ثابت)</div><div class="v">${fmt(s.dF, 1)} ث</div></div>
        <div class="stat"><div class="t">متوسط التأخير (ذكي)</div><div class="v" style="color:var(--ok)">${fmt(s.dA, 1)} ث</div></div>
        <div class="stat"><div class="t">التوفير</div><div class="v" style="color:var(--ok)">${fmt(100 * s.saving, 0)}٪</div></div>`;
      el.querySelector('#tb').innerHTML = s.js.map((j, i) => `<tr><td>${INTERSECTIONS[i].name}</td><td>${fmt(j.qNS + j.qEW)}</td>
        <td>${fmt(j.ai.C)} ث</td><td>${fmt(j.ai.gNS)} ث</td><td>${fmt(j.ai.gEW)} ث</td>
        <td>${fmt(j.dFixed, 1)} ← <b style="color:var(--ok)">${fmt(j.dAi, 1)}</b></td></tr>`).join('');
      chart.data.labels = sim.h.t; chart.update();
    };
    draw();
    const off = sim.on(draw);
    return () => { off(); chart.destroy(); };
  },
};
