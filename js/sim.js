// City simulation: an accelerated clock that produces the live data every
// sector reads (traffic, emergency room, energy, retail, air, waste).
// Deterministic seeded randomness so a reload looks the same.

export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const R = rng(2026);
export const gauss = (r = R) => { const u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const bump = (h, mu, sd) => Math.exp(-((h - mu) ** 2) / (2 * sd * sd));
const poisson = (lam) => { let L = Math.exp(-lam), k = 0, p = 1; do { k++; p *= R(); } while (p > L); return k - 1; };

export const STEP_MIN = 10;           // one sample every 10 city-minutes
export const DAY = (24 * 60) / STEP_MIN; // 144 samples per day

export const INTERSECTIONS = [
  { id: 'A', name: 'تقاطع الملك فهد', f: 1.25 },
  { id: 'B', name: 'تقاطع الكورنيش', f: 0.9 },
  { id: 'C', name: 'تقاطع الجامعة', f: 1.05 },
  { id: 'D', name: 'تقاطع السوق', f: 0.8 },
];
export const STATIONS = [
  { id: 1, name: 'محطة الميناء', base: 62 },
  { id: 2, name: 'محطة وسط البلد', base: 55 },
  { id: 3, name: 'محطة الحي السكني', base: 38 },
  { id: 4, name: 'محطة المنطقة الصناعية', base: 74 },
];

export function trafficProfile(h) {        // vehicles/hour per approach, typical weekday
  return 180 + 820 * bump(h, 7.6, 1.1) + 650 * bump(h, 13.2, 1.6) + 900 * bump(h, 17.4, 1.5) + 260 * bump(h, 21.5, 1.6);
}
export function erProfile(h) {             // ER arrivals/hour
  return 3 + 6 * bump(h, 11.5, 2.4) + 7 * bump(h, 21, 2.2);
}
export function loadProfile(h) {           // city load MW (afternoon AC peak)
  return 210 + 70 * bump(h, 8.5, 2) + 190 * bump(h, 15.2, 3) + 120 * bump(h, 21, 2.2);
}
export function solarProfile(h, cloud = 0) {   // MW, 150 MW field
  return Math.max(0, 150 * Math.sin(Math.PI * (h - 6) / 12.5)) * (h > 6 && h < 18.5 ? 1 : 0) * (1 - cloud);
}

export class CitySim {
  constructor() {
    this.minute = 7 * 60;               // day 1, 07:00
    this.day = 1;
    this.speed = 4;                     // city minutes per real second
    this.listeners = new Set();
    this.events = [];
    this.cloud = 0.1;
    this.h = {                          // rolling 24h history
      t: [], traffic: INTERSECTIONS.map(() => []), er: [], erQueue: [], load: [], solar: [],
      aqi: STATIONS.map(() => []), sales: [],
    };
    this.erQueue = 4; this.erStaff = 8;
    this.battery = { capMWh: 120, soc: 0.5, powerMW: 40 };
    this.salesToday = 0;
    this.salesHistory = this._makeSalesHistory(140);
    this.bins = this._makeBins(22);
    this.anomaly = null;
    this.smartSignals = true;
    // pre-fill 24h of history so charts are full on first view
    const start = this.minute;
    this.minute = start - 24 * 60;
    for (let i = 0; i < DAY; i++) this._step(true);
    this.minute = start;
    this.salesToday = 0;                // prefill must not count as today's sales
    this.bins = this._makeBins(22);     // start the day with freshly emptied-ish bins
    this.erQueue = 4;
    this.events = [];
    this._acc = 0;
  }

  get hour() { return (((this.minute % 1440) + 1440) % 1440) / 60; }
  get clock() { const m = ((this.minute % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach((fn) => fn(this)); }
  log(sector, text, level = 'info') {
    this.events.unshift({ t: this.clock, day: this.day, sector, text, level });
    this.events = this.events.slice(0, 60);
  }

  _makeSalesHistory(n) {               // daily grocery sales (SAR) with weekly pattern + trend
    const week = [1.0, 0.92, 0.9, 0.95, 1.18, 1.32, 1.08]; // Sun..Sat (Thu/Fri high)
    const out = [];
    for (let d = 0; d < n; d++) {
      const dow = d % 7;
      const v = (21000 + d * 22) * week[dow] * (1 + 0.05 * gauss()) + (d % 30 === 27 ? 6500 : 0); // payday bump
      out.push(Math.round(v));
    }
    return out;
  }
  _makeBins(n) {
    const r = rng(11), bins = [];
    for (let i = 0; i < n; i++) bins.push({ id: i + 1, x: 0.08 + 0.84 * r(), y: 0.1 + 0.8 * r(), fill: 0.15 + 0.6 * r(), rate: 0.004 + 0.01 * r() });
    return bins;
  }

  _step(silent = false) {
    this.minute += STEP_MIN;
    if (this.minute % 1440 === 0 && !silent) {
      this.day++; this.salesHistory.push(Math.round(this.salesToday || this.salesHistory.at(-7))); this.salesToday = 0;
      this.cloud = Math.min(0.8, Math.max(0, 0.15 + 0.25 * gauss()));
      this.log('grocery', 'إغلاق يوم المبيعات وتحديث نموذج التوقع');
    }
    const h = this.hour, hist = this.h;
    const push = (arr, v) => { arr.push(v); if (arr.length > DAY) arr.shift(); };
    push(hist.t, this.clock);

    INTERSECTIONS.forEach((it, i) => push(hist.traffic[i], Math.max(30, trafficProfile(h) * it.f * (1 + 0.08 * gauss()))));

    const arrivals = poisson(erProfile(h) * STEP_MIN / 60);
    const served = Math.min(this.erQueue + arrivals, poisson(this.erStaff * 1.2 * STEP_MIN / 60));
    this.erQueue = Math.max(0, this.erQueue + arrivals - served);
    push(hist.er, arrivals * 60 / STEP_MIN); push(hist.erQueue, this.erQueue);

    const load = loadProfile(h) * (1 + 0.03 * gauss()), solar = solarProfile(h, this.cloud) * (1 + 0.04 * gauss());
    push(hist.load, load); push(hist.solar, Math.max(0, solar));
    this._battery(load, solar);

    STATIONS.forEach((s, i) => {
      let v = s.base + 0.025 * (trafficProfile(h) - 400) + 6 * gauss();
      if (this.anomaly && this.anomaly.station === i && this.anomaly.left > 0) { v += this.anomaly.size; }
      push(hist.aqi[i], Math.max(5, v));
    });
    if (this.anomaly) { this.anomaly.left--; if (this.anomaly.left <= 0) this.anomaly = null; }
    else if (!silent && R() < 0.012) {
      this.anomaly = { station: Math.floor(R() * 4), size: 70 + 60 * R(), left: 4 + Math.floor(R() * 6) };
    }

    const salesNow = (this.salesHistory.at(-7) / 13.3) * (bump(h, 12.5, 2.5) + 1.4 * bump(h, 20.5, 2)) * STEP_MIN / 60 * (1 + 0.1 * gauss());
    if (h >= 7 && h <= 24) this.salesToday += Math.max(0, salesNow);
    push(hist.sales, Math.max(0, salesNow) * 6);

    this.bins.forEach((b) => { b.fill = Math.min(1, b.fill + b.rate * (STEP_MIN / 10) * (0.6 + bump(h, 20, 3))); });

    if (!silent) this._alerts();
  }

  _battery(load, solar) {
    const b = this.battery, dt = STEP_MIN / 60, peak = load > 420;
    let p = 0;                                  // + charge, - discharge (MW)
    if (solar > 0.35 * load || (this.hour > 1 && this.hour < 5)) p = Math.min(b.powerMW, (1 - b.soc) * b.capMWh / dt);
    else if (peak) p = -Math.min(b.powerMW, b.soc * b.capMWh / dt, load - 420);
    b.soc = Math.min(1, Math.max(0, b.soc + p * dt / b.capMWh));
    b.p = p;
  }

  _alerts() {
    const q = this.erQueue;
    if (q >= 14 && (this._lastEr || 0) < 14) this.log('hospital', `ضغط في الطوارئ: ${q} مريض بالانتظار، النموذج يقترح استدعاء طاقم إضافي`, 'warn');
    this._lastEr = q;
    const a = this.h.aqi.map((s) => s.at(-1));
    a.forEach((v, i) => {
      const s = this.h.aqi[i].slice(-36, -1), m = s.reduce((x, y) => x + y, 0) / s.length;
      const sd = Math.sqrt(s.reduce((x, y) => x + (y - m) ** 2, 0) / s.length) || 1;
      const hit = (v - m) / sd > 4 && v - m > 30;
      if (hit && !(this._aqiFlag || [])[i]) { this.log('air', `قراءة شاذة في ${STATIONS[i].name}: AQI ${v.toFixed(0)} (z=${((v - m) / sd).toFixed(1)})`, 'warn'); }
      (this._aqiFlag = this._aqiFlag || [])[i] = hit;
    });
    const full = this.bins.filter((b) => b.fill > 0.85).length;
    if (full >= 6 && !this._binFlag) this.log('waste', `${full} حاويات ممتلئة: جاهز مسار جمع جديد`, 'warn');
    this._binFlag = full >= 6;
    if (this.battery.p < -1 && !this._battFlag) this.log('energy', 'ذروة استهلاك: البطاريات تفرّغ لتخفيف الحمل', 'info');
    this._battFlag = this.battery.p < -1;
    const tr = this.h.traffic[0].at(-1);
    if (tr > 1000 && !this._trFlag) this.log('traffic', 'زحمة في تقاطع الملك فهد: الإشارات الذكية مددت الأخضر للاتجاه المزدحم', 'info');
    this._trFlag = tr > 1000;
  }

  tick(dtSec) {
    this._acc += dtSec * this.speed;
    let stepped = false;
    while (this._acc >= STEP_MIN) { this._acc -= STEP_MIN; this._step(); stepped = true; }
    if (stepped) this.emit();
  }
}
