// 🛒 Grocery: Holt-Winters sales forecast + market-basket recommendations.
import { rng } from '../sim.js';
import { fmt, lineChart } from '../ui.js';

// Additive Holt-Winters with weekly season; parameters chosen by grid search
export function holtWinters(y, m = 7, horizon = 14) {
  let best = null;
  for (const a of [0.1, 0.2, 0.3, 0.5]) for (const b of [0.01, 0.05, 0.1]) for (const g of [0.05, 0.1, 0.2, 0.3]) {
    let L = y.slice(0, m).reduce((s, v) => s + v, 0) / m;
    let T = (y.slice(m, 2 * m).reduce((s, v) => s + v, 0) - y.slice(0, m).reduce((s, v) => s + v, 0)) / (m * m);
    const S = y.slice(0, m).map((v) => v - L);
    let sse = 0;
    for (let t = m; t < y.length; t++) {
      const f = L + T + S[t % m];
      sse += (y[t] - f) ** 2;
      const L0 = L;
      L = a * (y[t] - S[t % m]) + (1 - a) * (L + T);
      T = b * (L - L0) + (1 - b) * T;
      S[t % m] = g * (y[t] - L) + (1 - g) * S[t % m];
    }
    if (!best || sse < best.sse) best = { a, b, g, sse, L, T, S: [...S], n: y.length };
  }
  const fc = [];
  for (let k = 1; k <= horizon; k++) fc.push(best.L + k * best.T + best.S[(best.n - 1 + k) % m]);
  const rmse = Math.sqrt(best.sse / (y.length - m));
  return { fc, rmse, params: best };
}

const ITEMS = ['خبز', 'حليب', 'بيض', 'تمر', 'قهوة', 'شاي', 'سكر', 'رز', 'دجاج', 'بهارات', 'طماطم', 'خيار', 'لبن', 'جبن', 'عصير', 'ماء', 'حفائظ', 'مناديل', 'شيبس', 'آيسكريم'];
const BUNDLES = [['خبز', 'جبن', 'بيض', 'حليب'], ['قهوة', 'تمر'], ['شاي', 'سكر'], ['رز', 'دجاج', 'بهارات'], ['طماطم', 'خيار', 'لبن'], ['شيبس', 'عصير', 'آيسكريم'], ['حفائظ', 'مناديل', 'ماء']];

function transactions(n = 4000) {
  const r = rng(99), tx = [];
  for (let i = 0; i < n; i++) {
    const basket = new Set();
    const k = 1 + Math.floor(r() * 2);
    for (let j = 0; j < k; j++) {
      const b = BUNDLES[Math.floor(r() * BUNDLES.length)];
      b.forEach((it) => { if (r() < 0.62) basket.add(it); });
    }
    for (let j = 0; j < 2; j++) if (r() < 0.5) basket.add(ITEMS[Math.floor(r() * ITEMS.length)]);
    if (basket.size) tx.push([...basket]);
  }
  return tx;
}

// association rules A -> B with support, confidence and lift
export function rules(tx) {
  const n = tx.length, single = {}, pair = {};
  tx.forEach((t) => {
    t.forEach((a) => { single[a] = (single[a] || 0) + 1; });
    for (const a of t) for (const b of t) if (a !== b) pair[a + '|' + b] = (pair[a + '|' + b] || 0) + 1;
  });
  return (a) => Object.entries(pair).filter(([k]) => k.startsWith(a + '|')).map(([k, c]) => {
    const b = k.split('|')[1];
    return { b, support: c / n, conf: c / single[a], lift: (c / single[a]) / (single[b] / n) };
  }).filter((r) => r.support > 0.01 && r.lift > 1.05).sort((x, y) => y.lift - x.lift).slice(0, 4);
}

const DOW = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default {
  id: 'grocery', icon: '🛒', title: 'البقالة', color: 'var(--grocery)',
  desc: 'توقع المبيعات للأسبوعين القادمة واقتراح منتجات للعملاء',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Holt-Winters forecasting</span><span class="tag">Market basket (lift)</span>
      <div class="row" id="st"></div>
      <div class="card" style="margin-top:12px"><h3>المبيعات اليومية والتوقع <span class="hint">ريال</span></h3><div class="chartbox" style="height:240px"><canvas id="ch"></canvas></div></div>
      <div class="card" style="margin-top:12px"><h3>"العملاء اللي اشتروا… اشتروا بعد" <span class="hint">اختر منتج</span></h3>
        <div id="chips"></div><table class="t" style="margin-top:8px"><thead><tr><th>اقتراح</th><th>الثقة</th><th>Lift</th></tr></thead><tbody id="rec"></tbody></table></div>
      <p class="note">النموذج يتعلم موسم الأسبوع (الخميس والجمعة أعلى) والاتجاه العام، ويختار معاملاته تلقائياً بأقل خطأ. الاقتراحات من ${'٤٬٠٠٠'} فاتورة اصطناعية بمقياس Lift.</p>`;
    const rec = rules(transactions());
    const chips = el.querySelector('#chips');
    chips.innerHTML = ITEMS.map((it) => `<span class="chip" data-i="${it}">${it}</span>`).join('');
    const pick = (it) => {
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.i === it));
      const rs = rec(it);
      el.querySelector('#rec').innerHTML = rs.length ? rs.map((r) => `<tr><td><b>${r.b}</b></td><td>${fmt(100 * r.conf)}٪</td><td>${fmt(r.lift, 2)}×</td></tr>`).join('') : '<tr><td colspan=3 style="color:var(--muted)">ما فيه منتج يرتبط فيه بقوة كافية</td></tr>';
    };
    chips.onclick = (e) => { const c = e.target.closest('.chip'); if (c) pick(c.dataset.i); };
    pick('قهوة');

    let chart;
    const draw = () => {
      const y = sim.salesHistory, { fc, rmse } = holtWinters(y);
      const histN = 56, hist = y.slice(-histN);
      const labels = [...hist.map((_, i) => `-${histN - i}`), ...fc.map((_, i) => `+${i + 1}`)];
      const ds = [
        { label: 'فعلي', data: [...hist, ...fc.map(() => null)], borderColor: '#22c37f' },
        { label: 'توقع', data: [...hist.map(() => null), ...fc], borderColor: '#f5d04c', borderDash: [6, 4] },
        { label: 'نطاق ±RMSE', data: [...hist.map(() => null), ...fc.map((v) => v + rmse)], borderColor: 'rgba(245,208,76,.25)', borderWidth: 1 },
        { label: ' ', data: [...hist.map(() => null), ...fc.map((v) => v - rmse)], borderColor: 'rgba(245,208,76,.25)', borderWidth: 1 },
      ];
      if (!chart) chart = lineChart(el.querySelector('#ch'), labels, ds, { y: { beginAtZero: false }, extra: { plugins: { legend: { labels: { filter: (it) => it.text.trim() } } } } });
      else { chart.data.labels = labels; ds.forEach((d, i) => { chart.data.datasets[i].data = d.data; }); chart.update(); }
      const next7 = fc.slice(0, 7).reduce((a, b) => a + b, 0);
      const peak = fc.slice(0, 7).indexOf(Math.max(...fc.slice(0, 7)));
      const peakDow = DOW[(y.length + peak) % 7];
      const mape = rmse / (y.slice(-28).reduce((a, b) => a + b, 0) / 28);
      el.querySelector('#st').innerHTML = `
        <div class="stat"><div class="t">مبيعات اليوم حتى الآن</div><div class="v">${fmt(sim.salesToday)}</div></div>
        <div class="stat"><div class="t">توقع الأسبوع القادم</div><div class="v">${fmt(next7)}</div></div>
        <div class="stat"><div class="t">أعلى يوم متوقع</div><div class="v" style="font-size:17px">${peakDow}</div></div>
        <div class="stat"><div class="t">خطأ النموذج</div><div class="v">±${fmt(100 * mape, 1)}٪</div></div>`;
    };
    draw();
    const off = sim.on(draw);
    return () => { off(); chart && chart.destroy(); };
  },
};
