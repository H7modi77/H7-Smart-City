// ⚡ Energy: solar + load monitoring and battery peak-shaving.
import { fmt, lineChart } from '../ui.js';

export default {
  id: 'energy', icon: '⚡', title: 'الطاقة', color: 'var(--energy)',
  desc: 'مزرعة شمسية وبطاريات ذكية تخفف ذروة الاستهلاك',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Peak shaving</span><span class="tag">Solar forecasting</span>
      <div class="row" id="st"></div>
      <div class="card" style="margin-top:12px"><h3>الحمل والطاقة الشمسية آخر 24 ساعة <span class="hint">ميغاواط</span></h3><div class="chartbox" style="height:240px"><canvas id="ch"></canvas></div></div>
      <div class="card" style="margin-top:12px"><h3>سياسة البطاريات</h3>
        <table class="t"><tr><td>☀️ فائض شمسي (أكثر من 35٪ من الحمل) أو بعد منتصف الليل</td><td>شحن</td></tr>
        <tr><td>🔥 الحمل فوق 420 ميغاواط (ذروة المكيفات العصر)</td><td>تفريغ لتخفيف الذروة</td></tr>
        <tr><td>غير ذلك</td><td>انتظار</td></tr></table></div>
      <p class="note">بطاريات بسعة 120 ميغاواط·ساعة وقدرة 40 ميغاواط. الذروة في المدن السعودية تكون عادة العصر بسبب التكييف، فالبطاريات تخزن طاقة الشمس الصبح وتفرّغها وقت الذروة.</p>`;
    const net = () => sim.h.load.map((l, i) => l - sim.h.solar[i]);
    const chart = lineChart(el.querySelector('#ch'), sim.h.t, [
      { label: 'الحمل', data: sim.h.load, borderColor: '#3fb6ff' },
      { label: 'شمسي', data: sim.h.solar, borderColor: '#f5d04c' },
      { label: 'من الشبكة', data: net(), borderColor: '#8a97b4', borderDash: [5, 4] }]);
    const draw = () => {
      const b = sim.battery, load = sim.h.load.at(-1), sol = sim.h.solar.at(-1);
      const share = sim.h.solar.reduce((a, v) => a + v, 0) / sim.h.load.reduce((a, v) => a + v, 0);
      const state = b.p > 1 ? `شحن ${fmt(b.p)} MW` : b.p < -1 ? `تفريغ ${fmt(-b.p)} MW` : 'انتظار';
      el.querySelector('#st').innerHTML = `
        <div class="stat"><div class="t">الحمل الآن</div><div class="v">${fmt(load)} MW</div></div>
        <div class="stat"><div class="t">الشمسي الآن</div><div class="v" style="color:#f5d04c">${fmt(sol)} MW</div></div>
        <div class="stat"><div class="t">نسبة الطاقة النظيفة (24س)</div><div class="v" style="color:var(--ok)">${fmt(100 * share)}٪</div></div>
        <div class="stat"><div class="t">البطاريات</div><div class="v">${fmt(100 * b.soc)}٪</div><div class="t">${state}</div></div>`;
      chart.data.labels = sim.h.t; chart.data.datasets[2].data = net(); chart.update();
    };
    draw();
    const off = sim.on(draw);
    return () => { off(); chart.destroy(); };
  },
};
