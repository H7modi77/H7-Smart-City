// 🗑️ Waste: smart bins + shortest collection route (nearest neighbour + 2-opt).
import { fmt } from '../ui.js';

const DEPOT = { x: 0.5, y: 0.96 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tourLen = (t) => t.reduce((s, p, i) => s + dist(p, t[(i + 1) % t.length]), 0);

export function planRoute(points) {
  if (!points.length) return [DEPOT];
  const left = [...points], tour = [DEPOT];
  while (left.length) {
    const cur = tour.at(-1);
    let bi = 0;
    left.forEach((p, i) => { if (dist(cur, p) < dist(cur, left[bi])) bi = i; });
    tour.push(left.splice(bi, 1)[0]);
  }
  let improved = true;                       // 2-opt: undo crossing edges
  while (improved) {
    improved = false;
    for (let i = 1; i < tour.length - 1; i++) for (let k = i + 1; k < tour.length; k++) {
      const a = tour[i - 1], b = tour[i], c = tour[k], d = tour[(k + 1) % tour.length];
      if (dist(a, c) + dist(b, d) < dist(a, b) + dist(c, d) - 1e-9) {
        tour.splice(i, k - i + 1, ...tour.slice(i, k + 1).reverse()); improved = true;
      }
    }
  }
  return tour;
}

export default {
  id: 'waste', icon: '🗑️', title: 'النظافة', color: 'var(--waste)',
  desc: 'حاويات ذكية تبلغ عن امتلائها ومسار جمع مختصر للشاحنة',
  mount(el, sim) {
    el.innerHTML = `
      <span class="tag">Route optimisation (TSP: NN + 2-opt)</span>
      <div class="row" id="st"></div>
      <div class="card" style="margin-top:12px"><h3>خريطة الحاويات والمسار المقترح</h3>
        <canvas id="map" style="width:100%;aspect-ratio:16/10;display:block;border-radius:10px;background:#0a1222"></canvas>
        <label class="slider" style="margin-top:10px"><span>اجمع الحاويات فوق</span><input type="range" id="th" min="0.4" max="0.95" step="0.05" value="0.7"><output id="tho">70٪</output></label>
        <div class="row"><button class="btn" id="go">🚛 أرسل الشاحنة</button></div></div>
      <p class="note">بدل ما تلف الشاحنة على كل الحاويات بالترتيب، النظام يختار بس الممتلئة ويرتبها بأقصر مسار (أقرب جار ثم تحسين 2-opt يفك تقاطعات المسار).</p>`;
    const cv = el.querySelector('#map'), ctx = cv.getContext('2d');
    let th = 0.7, route = [];
    const draw = () => {
      const W = cv.width = cv.clientWidth * devicePixelRatio, H = cv.height = cv.clientHeight * devicePixelRatio;
      const P = (p) => [p.x * W, p.y * H];
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#16213a'; ctx.lineWidth = 10 * devicePixelRatio;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(i * W / 5, 0); ctx.lineTo(i * W / 5, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * H / 5); ctx.lineTo(W, i * H / 5); ctx.stroke(); }
      const due = sim.bins.filter((b) => b.fill >= th);
      route = planRoute(due);
      ctx.strokeStyle = '#22c37f'; ctx.lineWidth = 3 * devicePixelRatio; ctx.setLineDash([8, 6]);
      ctx.beginPath(); route.forEach((p, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, ...P(p))); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
      sim.bins.forEach((b) => {
        const [x, y] = P(b), c = b.fill > 0.85 ? '#ef5a5a' : b.fill >= th ? '#f2a531' : '#4b5a7a';
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 9 * devicePixelRatio, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = `${10 * devicePixelRatio}px IBM Plex Mono`; ctx.textAlign = 'center';
        ctx.fillText(Math.round(b.fill * 100), x, y - 13 * devicePixelRatio);
      });
      const [dx, dy] = P(DEPOT); ctx.fillStyle = '#3fb6ff'; ctx.fillRect(dx - 10, dy - 10, 20, 20);
      const naive = tourLen([DEPOT, ...sim.bins]), smart = due.length ? tourLen(route) : 0;
      el.querySelector('#st').innerHTML = `
        <div class="stat"><div class="t">حاويات تحتاج جمع</div><div class="v">${due.length} / ${sim.bins.length}</div></div>
        <div class="stat"><div class="t">مسافة المسار الذكي</div><div class="v">${fmt(smart * 10, 1)} كم</div></div>
        <div class="stat"><div class="t">لو لفّت على الكل بالترتيب</div><div class="v">${fmt(naive * 10, 1)} كم</div></div>
        <div class="stat"><div class="t">التوفير</div><div class="v" style="color:var(--ok)">${fmt(100 * (1 - smart / naive))}٪</div></div>`;
    };
    el.querySelector('#th').oninput = (e) => { th = +e.target.value; el.querySelector('#tho').textContent = `${Math.round(th * 100)}٪`; draw(); };
    el.querySelector('#go').onclick = () => {
      const n = route.length - 1; route.slice(1).forEach((b) => { b.fill = 0.05; });
      sim.log('waste', `الشاحنة جمعت ${n} حاوية بمسار ${fmt(tourLen(route) * 10, 1)} كم`); draw();
    };
    const ro = new ResizeObserver(draw); ro.observe(cv);
    const off = sim.on(draw);
    return () => { off(); ro.disconnect(); };
  },
};
