// 🏥 Hospital: emergency triage priority model + ER demand forecast and staffing.
import { bars, fmt, lineChart, loadJSON } from '../ui.js';

const LEVELS = {
  1: ['إنعاش فوري', '#ef5a5a'], 2: ['طارئ جداً', '#f2793a'], 3: ['عاجل', '#f2a531'],
  4: ['أقل عجلة', '#3fb6ff'], 5: ['غير عاجل', '#22c37f'],
};
const FIELDS = [
  ['age', 'العمر', 1, 99, 1, 45], ['heart_rate', 'النبض', 30, 200, 1, 88],
  ['systolic_bp', 'الضغط الانقباضي', 60, 220, 1, 122], ['spo2', 'تشبع الأكسجين ٪', 70, 100, 1, 97],
  ['temperature', 'الحرارة °C', 34, 42, 0.1, 37], ['resp_rate', 'معدل التنفس', 6, 40, 1, 16],
  ['pain', 'الألم (0–10)', 0, 10, 1, 3],
];

let model = null;
export function triage(m, x) {
  const z = m.features.map((f, i) => (x[f] - m.mean[i]) / m.std[i]);
  const feats = [...z, ...z.map((v) => v * v)];
  const logits = m.W.map((w, k) => w.reduce((a, wi, i) => a + wi * feats[i], m.b[k]));
  const mx = Math.max(...logits), ex = logits.map((l) => Math.exp(l - mx)), s = ex.reduce((a, b) => a + b, 0);
  return ex.map((e) => e / s);
}

// seasonal forecast: same hour yesterday, scaled by how today compares so far
export function erForecast(sim, hours = 6) {
  const per = 6, hist = sim.h.er, n = hist.length;
  const recent = hist.slice(-per * 3), lastDay = hist.slice(0, per * 3);
  const ratio = (recent.reduce((a, b) => a + b, 0) + 1) / (lastDay.reduce((a, b) => a + b, 0) + 1);
  const out = [];
  for (let k = 1; k <= hours; k++) {
    const idx = (k * per) % n, win = hist.slice(Math.max(0, idx - 3), idx + 3);
    out.push(Math.max(0, (win.reduce((a, b) => a + b, 0) / win.length) * Math.min(1.6, Math.max(0.6, ratio))));
  }
  return out;
}

export default {
  id: 'hospital', icon: '🏥', title: 'المستشفى', color: 'var(--hospital)',
  desc: 'فرز حالات الطوارئ بالذكاء الاصطناعي وتوقع الضغط وتوزيع الطاقم',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Logistic regression</span><span class="tag">Demand forecasting</span>
      <div class="card"><h3>فرز مريض جديد <span class="hint">حرّك القيم</span></h3>
        <div id="sl"></div>
        <div id="res" style="margin:12px 0 6px;font-size:18px;font-weight:700"></div>
        <div class="bars" id="pb"></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>الطوارئ آخر 24 ساعة</h3><div class="chartbox"><canvas id="ch"></canvas></div></div>
      <div class="card" style="margin-top:12px"><h3>توقع الـ6 ساعات القادمة والطاقم المقترح</h3>
        <div class="row" id="fc"></div>
        <div class="row" style="margin-top:10px"><button class="btn" id="apply">طبّق الطاقم المقترح</button><span id="cur" style="font-size:13px;color:var(--muted)"></span></div>
      </div>
      <p class="note">⚠️ نموذج تعليمي مدرّب على بيانات اصطناعية لعرض الفكرة فقط، وليس أداة طبية ولا يُستخدم للتشخيص.</p>`;
    const vals = {};
    el.querySelector('#sl').innerHTML = FIELDS.map(([k, label, mn, mx, st, v]) => {
      vals[k] = v;
      return `<label class="slider"><span>${label}</span><input type="range" min="${mn}" max="${mx}" step="${st}" value="${v}" data-k="${k}"><output>${v}</output></label>`;
    }).join('');
    const run = () => {
      if (!model) return;
      const p = triage(model, vals);
      const best = model.classes[p.indexOf(Math.max(...p))];
      const [name, col] = LEVELS[best];
      el.querySelector('#res').innerHTML = `المستوى ${best}: <span style="color:${col}">${name}</span>`;
      bars(el.querySelector('#pb'), model.classes.map((c, i) => ({ label: `مستوى ${c}`, value: p[i], text: `${fmt(100 * p[i])}٪`, color: LEVELS[c][1] })));
    };
    el.querySelectorAll('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      vals[inp.dataset.k] = +inp.value; inp.nextElementSibling.textContent = inp.value; run();
    }));
    (model ? Promise.resolve(model) : loadJSON('models/triage_lr.json')).then((m) => { model = m; run(); });

    const chart = lineChart(el.querySelector('#ch'), sim.h.t, [
      { label: 'وصول/ساعة', data: sim.h.er, borderColor: '#ef5a5a' },
      { label: 'بالانتظار', data: sim.h.erQueue, borderColor: '#f2a531' }]);
    let rec = 6;
    const draw = () => {
      const f = erForecast(sim), peak = Math.max(...f);
      rec = Math.max(4, Math.ceil(peak / 0.9 * 0.85 + sim.erQueue / 6));
      el.querySelector('#fc').innerHTML = f.map((v, i) => `<div class="stat"><div class="t">+${i + 1} ساعة</div><div class="v">${fmt(v, 1)}</div></div>`).join('') +
        `<div class="stat" style="border-color:#7a2a2a"><div class="t">الطاقم المقترح</div><div class="v">${rec}</div></div>`;
      el.querySelector('#cur').textContent = `الطاقم الحالي: ${sim.erStaff} · بالانتظار الآن: ${sim.erQueue}`;
      chart.data.labels = sim.h.t; chart.update();
    };
    el.querySelector('#apply').onclick = () => { sim.erStaff = rec; sim.log('hospital', `تم تعديل طاقم الطوارئ إلى ${rec} حسب التوقع`); draw(); };
    draw();
    const off = sim.on(draw);
    return () => { off(); chart.destroy(); };
  },
};
