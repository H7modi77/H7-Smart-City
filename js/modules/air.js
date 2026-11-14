// 🌫️ Air quality: rolling z-score anomaly detection on sensor streams.
import { STATIONS } from '../sim.js';
import { fmt, lineChart } from '../ui.js';

export function anomalies(series, win = 36, z = 4, minDelta = 30) {
  const flags = series.map(() => null);
  for (let i = win; i < series.length; i++) {
    const s = series.slice(i - win, i), m = s.reduce((a, b) => a + b, 0) / win;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / win) || 1;
    if ((series[i] - m) / sd > z && series[i] - m > minDelta) flags[i] = series[i];
  }
  return flags;
}
const cat = (v) => v <= 50 ? ['جيد', '#22c37f'] : v <= 100 ? ['متوسط', '#f5d04c'] : v <= 150 ? ['غير صحي للحساسين', '#f2a531'] : ['غير صحي', '#ef5a5a'];
const COLORS = ['#a98bff', '#3fb6ff', '#22c37f', '#f2a531'];

export default {
  id: 'air', icon: '🌫️', title: 'جودة الهواء', color: 'var(--air)',
  desc: 'حساسات في المدينة ونموذج يكتشف القراءات الشاذة (غبار، تسرب)',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Anomaly detection (rolling z-score)</span>
      <div class="row" id="st"></div>
      <div class="card" style="margin-top:12px"><h3>مؤشر جودة الهواء AQI <span class="hint">النقاط الحمراء = شذوذ مكتشف</span></h3><div class="chartbox" style="height:250px"><canvas id="ch"></canvas></div></div>
      <div class="row" style="margin-top:12px"><button class="btn" id="dust">🌪️ حاكِ عاصفة غبار</button><span style="font-size:13px;color:var(--muted)">وشوف كيف النموذج يكتشفها</span></div>
      <p class="note">لكل حساس، النموذج يحسب المتوسط والانحراف لآخر 6 ساعات، وأي قراءة تبعد أكثر من 4 انحرافات معيارية (وفوق المتوسط بـ30 نقطة على الأقل) تنعلَّم كشذوذ ويطلع تنبيه في لوحة التحكم.</p>`;
    const ds = () => [
      ...STATIONS.map((s, i) => ({ label: s.name, data: sim.h.aqi[i], borderColor: COLORS[i] })),
      { label: 'شذوذ', data: sim.h.aqi.map((s) => anomalies(s)).reduce((acc, f) => acc.map((v, i) => v ?? f[i]), sim.h.aqi[0].map(() => null)),
        borderColor: 'transparent', pointRadius: 5, pointBackgroundColor: '#ef5a5a', showLine: false },
    ];
    const chart = lineChart(el.querySelector('#ch'), sim.h.t, ds());
    const draw = () => {
      el.querySelector('#st').innerHTML = STATIONS.map((s, i) => {
        const v = sim.h.aqi[i].at(-1), [t, c] = cat(v);
        return `<div class="stat"><div class="t">${s.name}</div><div class="v" style="color:${c}">${fmt(v)}</div><div class="t">${t}</div></div>`;
      }).join('');
      chart.data.labels = sim.h.t; chart.data.datasets = ds().map((d) => ({ pointRadius: 0, borderWidth: 2, tension: 0.3, ...d })); chart.update();
    };
    el.querySelector('#dust').onclick = () => { sim.anomaly = { station: Math.floor(Math.random() * 4), size: 110, left: 6 }; sim.log('air', 'بدأت محاكاة عاصفة غبار'); };
    draw();
    const off = sim.on(draw);
    return () => { off(); chart.destroy(); };
  },
};
