// 🏫 School: draw a digit with your finger, a neural network (MLP) reads it.
import { bars, fmt, loadJSON } from '../ui.js';

let model = null;
export function mlp(m, x) {
  let a = x.map((v) => v * m.input_scale);
  m.layers.forEach((L, li) => {
    a = L.W.map((row, j) => row.reduce((s, w, i) => s + w * a[i], L.b[j]));
    if (li < m.layers.length - 1) a = a.map((v) => Math.max(0, v));
  });
  const mx = Math.max(...a), ex = a.map((v) => Math.exp(v - mx)), s = ex.reduce((p, q) => p + q, 0);
  return ex.map((e) => e / s);
}

// Same steps as training/train_models.py::preprocess
export function to8x8(ctx, size) {
  const d = ctx.getImageData(0, 0, size, size).data;
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (d[(y * size + x) * 4] > 20) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, hh = y1 - y0 + 1, side = Math.floor(Math.max(w, hh) * 1.25) + 1;
  const ox = Math.floor((side - w) / 2) - x0, oy = Math.floor((side - hh) / 2) - y0;
  const out = new Array(64).fill(0), cnt = new Array(64).fill(0);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const sx = x - ox, sy = y - oy;
    const v = sx >= 0 && sy >= 0 && sx < size && sy < size ? d[(sy * size + sx) * 4] : 0;
    const cell = Math.min(7, Math.floor(y * 8 / side)) * 8 + Math.min(7, Math.floor(x * 8 / side));
    out[cell] += v; cnt[cell]++;
  }
  const avg = out.map((v, i) => v / Math.max(1, cnt[i]));
  const mx = Math.max(...avg, 1e-6);
  return avg.map((v) => v / mx * 16);
}

export default {
  id: 'school', icon: '🏫', title: 'المدرسة', color: 'var(--school)',
  desc: 'ارسم رقم بإصبعك والشبكة العصبية تتعرف عليه',
  mount(el) {
    el.innerHTML = `
      <span class="tag">Neural network (MLP 64-48-10)</span><span class="tag">Handwriting recognition</span>
      <div class="grid2" style="grid-template-columns:auto 1fr;align-items:start">
        <div><canvas class="pad" id="pad" width="280" height="280"></canvas>
          <div class="row" style="margin-top:8px"><button class="btn ghost" id="clr">امسح</button><span style="font-size:13px;color:var(--muted)">ارسم رقم من 0 إلى 9</span></div></div>
        <div class="card"><h3>قراءة النموذج</h3>
          <div class="row"><div id="big" style="font:700 64px IBM Plex Mono,monospace;min-width:70px;text-align:center">?</div>
            <div><canvas class="mini" id="mini" width="8" height="8"></canvas><div style="font-size:11px;color:var(--muted);text-align:center">اللي يشوفه النموذج (8×8)</div></div></div>
          <div class="bars" id="pb" style="margin-top:10px"></div></div>
      </div>
      <p class="note">الشبكة مدربة على بيانات أرقام مكتوبة باليد (scikit-learn digits) مع تحويلات تشبه الرسم بالإصبع. دقتها على أرقام الاختبار <b id="acc">…</b>. الأوزان محفوظة JSON وتنحسب داخل المتصفح بدون أي مكتبة.</p>`;
    const pad = el.querySelector('#pad'), ctx = pad.getContext('2d', { willReadFrequently: true });
    const mini = el.querySelector('#mini').getContext('2d');
    const clear = () => { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 280, 280); el.querySelector('#big').textContent = '?'; el.querySelector('#pb').innerHTML = ''; mini.clearRect(0, 0, 8, 8); };
    clear();
    let drawing = false, last = null;
    const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * 280 / r.width, (e.clientY - r.top) * 280 / r.height]; };
    const predict = () => {
      if (!model) return;
      const x = to8x8(ctx, 280); if (!x) return;
      const img = mini.createImageData(8, 8);
      x.forEach((v, i) => { const g = v / 16 * 255; img.data.set([g, g, g, 255], i * 4); });
      mini.putImageData(img, 0, 0);
      const p = mlp(model, x), best = p.indexOf(Math.max(...p));
      el.querySelector('#big').textContent = best;
      const top = p.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 4);
      bars(el.querySelector('#pb'), top.map(([i, v]) => ({ label: `الرقم ${i}`, value: v, text: `${fmt(100 * v)}٪` })), 'var(--school)');
    };
    pad.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); pad.setPointerCapture(e.pointerId); });
    pad.addEventListener('pointermove', (e) => {
      if (!drawing) return; const p = pos(e);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p;
    });
    const end = () => { if (drawing) { drawing = false; predict(); } };
    pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    el.querySelector('#clr').onclick = clear;
    (model ? Promise.resolve(model) : loadJSON('models/digits_mlp.json')).then((m) => {
      model = m; el.querySelector('#acc').textContent = `${fmt(m.test_accuracy * 100, 1)}٪`;
    });
    return () => {};
  },
};
