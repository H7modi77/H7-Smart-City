// 3D tour of the city (three.js). Landmark buildings open their AI module.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { rng } from './sim.js';

const BLOCK = 40, ROAD = 10, N = 5, HALF = (N * BLOCK) / 2;
const blockCenter = (i, j) => new THREE.Vector3(-HALF + BLOCK * (i + 0.5), 0, -HALF + BLOCK * (j + 0.5));

function label(text, color = '#ffffff') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,16,32,.82)'; g.beginPath(); g.roundRect(8, 16, 496, 96, 40); g.fill();
  g.strokeStyle = color; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#fff'; g.font = '600 52px "IBM Plex Sans Arabic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.direction = 'rtl'; g.fillText(text, 256, 66);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(30, 7.5, 1); s.renderOrder = 10;
  return s;
}

function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts }));
  m.position.y = h / 2; m.castShadow = m.receiveShadow = true;
  return m;
}

export function createCity(canvas, sim, onPick) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = !/Mobi|Android/i.test(navigator.userAgent);
  renderer.xr.enabled = true;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 2000);
  camera.position.set(120, 150, 190);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 30; controls.maxDistance = 420;

  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x20242c, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, far: 600 });
  scene.add(sun);

  // ground, roads, sidewalks
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0xc9b38a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.9 });
  for (let k = 0; k <= N; k++) {
    const p = -HALF + k * BLOCK;
    const a = new THREE.Mesh(new THREE.PlaneGeometry(N * BLOCK + ROAD, ROAD), roadMat); a.rotation.x = -Math.PI / 2; a.position.set(0, 0.05, p); scene.add(a);
    const b = a.clone(); b.rotation.z = Math.PI / 2; b.position.set(p, 0.06, 0); scene.add(b);
  }
  // highway entrance to the south gate
  const hw = new THREE.Mesh(new THREE.PlaneGeometry(ROAD, 120), roadMat); hw.rotation.x = -Math.PI / 2; hw.position.set(0, 0.05, HALF + 60); scene.add(hw);

  // generic buildings (one InstancedMesh)
  const LANDMARK_BLOCKS = { '1,1': 'hospital', '3,1': 'school', '1,3': 'grocery', '3,3': 'energy', '2,2': 'air', '4,4': 'waste', '0,4': 'park' };
  const r = rng(5), dummy = new THREE.Object3D(), tmp = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (LANDMARK_BLOCKS[`${i},${j}`]) continue;
    const c = blockCenter(i, j), central = 1 - c.length() / (HALF * 1.4);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
      const w = 9 + r() * 5, d = 9 + r() * 5, hgt = 6 + r() * 14 + Math.max(0, central) * 22 * r();
      tmp.push({ x: c.x - 8 + a * 16, z: c.z - 8 + b * 16, w, d, h: hgt, col: new THREE.Color().setHSL(0.58 + r() * 0.08, 0.12, 0.62 + r() * 0.2) });
    }
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15, emissive: 0xffcc66, emissiveIntensity: 0 }), tmp.length);
  tmp.forEach((t, k) => { dummy.position.set(t.x, t.h / 2, t.z); dummy.scale.set(t.w, t.h, t.d); dummy.updateMatrix(); inst.setMatrixAt(k, dummy.matrix); inst.setColorAt(k, t.col); });
  inst.castShadow = inst.receiveShadow = true; scene.add(inst);

  // landmarks
  const pickables = [], anchors = {};
  const addLandmark = (id, group, pos, text, color) => {
    group.position.copy(pos); scene.add(group);
    group.traverse((o) => { if (o.isMesh) { o.userData.module = id; pickables.push(o); } });
    const l = label(text, color); l.position.set(pos.x, 52, pos.z); scene.add(l);
    l.userData.module = id; pickables.push(l);
    anchors[id] = pos.clone();
  };
  { // hospital
    const g = new THREE.Group(); g.add(box(26, 22, 18, 0xf2f4f8));
    const w = box(10, 34, 10, 0xe6ebf3); w.position.x = -8; g.add(w);
    const cross1 = box(8, 2.2, 2.2, 0xe5383b), cross2 = box(2.2, 8, 2.2, 0xe5383b);
    cross1.position.set(4, 18, 9.2); cross2.position.set(4, 18, 9.2); g.add(cross1, cross2);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x3a3f4b })); pad.position.set(-8, 34.3, 0); g.add(pad);
    addLandmark('hospital', g, blockCenter(1, 1), '🏥 المستشفى', '#ef5a5a');
  }
  { // school
    const g = new THREE.Group(); const b = box(28, 12, 14, 0xf3d36b); b.position.z = -6; g.add(b);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), new THREE.MeshStandardMaterial({ color: 0x3f9b4f })); field.rotation.x = -Math.PI / 2; field.position.set(0, 0.1, 10); g.add(field);
    const flag = box(0.6, 18, 0.6, 0xdddddd); flag.position.set(12, 0, 6); g.add(flag);
    const cloth = box(6, 3.5, 0.2, 0x0b7a3e); cloth.position.set(15, 7, 6); g.add(cloth);
    addLandmark('school', g, blockCenter(3, 1), '🏫 المدرسة', '#f5d04c');
  }
  { // grocery
    const g = new THREE.Group(); g.add(box(24, 9, 16, 0xeef2ea));
    const aw = box(24, 1, 4, 0x22c37f); aw.position.set(0, 7, 9.5); g.add(aw);
    for (let k = 0; k < 6; k++) { const c = box(4, 1.6, 2.2, [0xd13b3b, 0x3b6fd1, 0xffffff][k % 3]); c.position.set(-12 + k * 5, 0, 16); g.add(c); }
    addLandmark('grocery', g, blockCenter(1, 3), '🛒 البقالة', '#22c37f');
  }
  { // energy: solar field + batteries
    const g = new THREE.Group(), pm = new THREE.MeshStandardMaterial({ color: 0x1f4fa8, metalness: 0.6, roughness: 0.25 });
    for (let a = 0; a < 5; a++) for (let b = 0; b < 4; b++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 3), pm); p.position.set(-12 + a * 6, 1.6, -10 + b * 5); p.rotation.x = -0.45; p.castShadow = true; g.add(p);
    }
    for (let k = 0; k < 3; k++) { const c = box(10, 5, 4, 0xf0f0f0); c.position.set(-10 + k * 11, 0, 13); g.add(c); }
    addLandmark('energy', g, blockCenter(3, 3), '⚡ الطاقة', '#3fb6ff');
  }
  let beacon;
  { // air: central plaza tower
    const g = new THREE.Group();
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshStandardMaterial({ color: 0xd8cfc0 })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.1; g.add(plaza);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.4, 40, 12), new THREE.MeshStandardMaterial({ color: 0xc9d2e3 })); t.position.y = 20; g.add(t);
    beacon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 20, 20), new THREE.MeshStandardMaterial({ color: 0xa98bff, emissive: 0xa98bff, emissiveIntensity: 1 })); beacon.position.y = 41; g.add(beacon);
    addLandmark('air', g, blockCenter(2, 2), '🌫️ جودة الهواء', '#a98bff');
  }
  { // waste depot
    const g = new THREE.Group(); g.add(box(22, 10, 14, 0x8d97a8));
    for (let k = 0; k < 2; k++) { const tr = box(8, 4, 3.5, 0x2e8b57); tr.position.set(-6 + k * 12, 0, 12); g.add(tr); }
    addLandmark('waste', g, blockCenter(4, 4), '🗑️ النظافة', '#9aa7bd');
  }
  { // park
    const g = new THREE.Group(); const grass = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x4f9d58 })); grass.rotation.x = -Math.PI / 2; grass.position.y = 0.08; g.add(grass);
    for (let k = 0; k < 14; k++) { const p = new THREE.Mesh(new THREE.ConeGeometry(2.2, 7, 8), new THREE.MeshStandardMaterial({ color: 0x2f7a3a })); p.position.set(-12 + (k % 5) * 6, 3.5, -12 + Math.floor(k / 5) * 11); g.add(p); }
    g.position.copy(blockCenter(0, 4)); scene.add(g);
  }
  { // traffic: south entrance gate with ANPR cameras + signal poles at junctions
    const g = new THREE.Group();
    const l = box(2, 14, 2, 0x5a6478), rr = l.clone(); l.position.x = -7; rr.position.x = 7; g.add(l, rr);
    const top = box(16, 3, 3, 0xf2a531); top.position.y = 14; g.add(top);
    const cam = box(1.5, 1.5, 3, 0x111111); cam.position.set(0, 12.5, 2.5); g.add(cam);
    const bar = box(10, 0.6, 0.6, 0xe5383b); bar.position.set(-1, 3, 0); g.add(bar);
    addLandmark('traffic', g, new THREE.Vector3(0, 0, HALF + 30), '🚦 بوابة المرور', '#f2a531');
  }
  const lights = [];
  for (let k = 1; k < N; k++) for (let m = 1; m < N; m += 2) {
    const pole = box(0.6, 8, 0.6, 0x333a48); pole.position.set(-HALF + k * BLOCK + 6, 0, -HALF + m * BLOCK + 6); scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 10), new THREE.MeshBasicMaterial({ color: 0x22c37f })); lamp.position.set(pole.position.x, 8.4, pole.position.z); scene.add(lamp);
    lamp.userData.module = 'traffic'; pickables.push(lamp); lights.push(lamp);
  }

  // cars on a road loop
  const carGeo = new THREE.BoxGeometry(3.6, 1.6, 1.8), cars = [], rc = rng(3);
  const lanes = [];
  for (let k = 0; k <= N; k++) { const p = -HALF + k * BLOCK; lanes.push({ axis: 'x', fixed: p - 2 }, { axis: 'x', fixed: p + 2, dir: -1 }, { axis: 'z', fixed: p - 2 }, { axis: 'z', fixed: p + 2, dir: -1 }); }
  for (let k = 0; k < 90; k++) {
    const m = new THREE.Mesh(carGeo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(rc(), 0.6, 0.5) }));
    const lane = lanes[Math.floor(rc() * lanes.length)];
    m.userData = { lane, t: rc() * N * BLOCK, v: 14 + rc() * 10 }; m.position.y = 1; scene.add(m); cars.push(m);
  }

  // interaction
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) onPick(hit.object.userData.module);
  });

  let fly = null;
  const flyTo = (id) => {
    const p = anchors[id]; if (!p) return;
    fly = { from: camera.position.clone(), to: p.clone().add(new THREE.Vector3(45, 55, 60)), tf: controls.target.clone(), tt: p.clone(), k: 0 };
  };

  const resize = () => {
    const w = canvas.clientWidth, hgt = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(hgt * renderer.getPixelRatio())) {
      renderer.setSize(w, hgt, false); camera.aspect = w / hgt; camera.updateProjectionMatrix();
    }
  };

  const sky = new THREE.Color(), dayC = new THREE.Color(0x8ec5ff), nightC = new THREE.Color(0x0a1020), duskC = new THREE.Color(0xf29b6b);
  const clock = new THREE.Clock();
  let running = true;
  renderer.setAnimationLoop(() => {
    if (!running) return;
    const dt = Math.min(0.05, clock.getDelta());
    resize();
    const h = sim.hour, day = Math.max(0, Math.sin(Math.PI * (h - 6) / 12));
    sky.copy(nightC).lerp(dayC, day);
    if (day > 0 && day < 0.35) sky.lerp(duskC, 0.35 - day);
    scene.background = sky; scene.fog = new THREE.Fog(sky, 260, 700);
    sun.intensity = 0.2 + 1.6 * day; hemi.intensity = 0.35 + 0.6 * day;
    sun.position.set(Math.cos(Math.PI * (h - 6) / 12) * 200, 40 + 220 * day, 80);
    inst.material.emissiveIntensity = (1 - day) * 0.35;
    // traffic intensity drives how many cars move
    const flow = sim.h.traffic[0].at(-1) / 1250, active = Math.round(25 + 65 * Math.min(1, flow));
    cars.forEach((c, k) => {
      c.visible = k < active; if (!c.visible) return;
      const u = c.userData, L = N * BLOCK; u.t = (u.t + u.v * dt * (u.lane.dir || 1) + L) % L;
      const s = -HALF + u.t;
      if (u.lane.axis === 'x') { c.position.set(s, 1, u.lane.fixed); c.rotation.y = 0; } else { c.position.set(u.lane.fixed, 1, s); c.rotation.y = Math.PI / 2; }
    });
    const cyc = (performance.now() / 1000) % 8;
    lights.forEach((l, k) => l.material.color.setHex(((cyc + k) % 8) < 4.2 ? 0x22c37f : ((cyc + k) % 8) < 5 ? 0xf2a531 : 0xe5383b));
    const aqi = Math.max(...sim.h.aqi.map((s) => s.at(-1)));
    beacon.material.color.setHex(aqi > 150 ? 0xef5a5a : aqi > 100 ? 0xf2a531 : 0xa98bff); beacon.material.emissive.copy(beacon.material.color);
    beacon.scale.setScalar(1 + 0.15 * Math.sin(performance.now() / 300));
    if (fly) {
      fly.k = Math.min(1, fly.k + dt * 0.9); const e = 1 - (1 - fly.k) ** 3;
      camera.position.lerpVectors(fly.from, fly.to, e); controls.target.lerpVectors(fly.tf, fly.tt, e);
      if (fly.k >= 1) fly = null;
    }
    controls.update();
    renderer.render(scene, camera);
  });

  // WebXR: only show the VR button on devices that can actually enter VR
  const vrButton = document.createElement('span');
  if (navigator.xr) navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    const b = VRButton.createButton(renderer); b.style.left = '12px'; b.style.bottom = '64px'; vrButton.appendChild(b);
  }).catch(() => {});
  return { flyTo, vrButton, pause: (p) => { running = !p; } };
}
