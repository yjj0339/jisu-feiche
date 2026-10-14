// ===== 赛道：闭合样条采样 + 路面/环境网格构建 =====
import * as THREE from 'three';
import { ROAD_HALF } from './config.js';

export class TrackData {
  constructor(def) {
    this.def = def;
    const pts = def.pts.map(p => new THREE.Vector3(p[0] * def.scale, p[1] * def.scale, p[2] * def.scale));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.5);
    const N = this.N = 1400;
    const up = new THREE.Vector3(0, 1, 0);
    this.pos = []; this.tan = []; this.right = []; this.cum = []; this.curv = [];
    let acc = 0;
    const raw = [];
    for (let i = 0; i < N; i++) {
      const p = this.curve.getPointAt(i / N);
      const t = this.curve.getTangentAt(i / N).normalize();
      raw.push({ p, t });
    }
    for (let i = 0; i < N; i++) {
      const { p, t } = raw[i];
      const r = new THREE.Vector3().crossVectors(t, up).normalize(); // 行进方向右手边
      this.pos.push(p); this.tan.push(t); this.right.push(r);
      if (i > 0) acc += p.distanceTo(raw[i - 1].p);
      this.cum.push(acc);
    }
    this.length = acc + raw[N - 1].p.distanceTo(raw[0].p);
    // 有符号曲率：+ = 左弯
    for (let i = 0; i < N; i++) {
      const a = this.tan[i], b = this.tan[(i + 1) % N];
      const cross = a.x * b.z - a.z * b.x; // 绕 y 的叉积分量（近似）
      const ds = Math.max(0.01, this.segLen(i));
      this.curv.push(Math.asin(THREE.MathUtils.clamp(-cross, -1, 1)) / ds);
    }
    // 平滑曲率 + 前瞻最大曲率（AI 刹车用）
    this.curvSm = smooth(this.curv, 12);
    this.curvAhead = [];
    for (let i = 0; i < N; i++) {
      let m = 0;
      for (let k = 0; k < 26; k++) m = Math.max(m, Math.abs(this.curvSm[(i + k) % N]));
      this.curvAhead.push(m);
    }
    // 起点线：最靠近 startAt 的采样，并把数组旋转到起点（s=0 即起跑线，圈数计数与视觉一致）
    const sa = new THREE.Vector3(...def.startAt);
    let best = 0, bd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = this.pos[i].distanceToSquared(sa);
      if (d < bd) { bd = d; best = i; }
    }
    if (best !== 0) {
      this.pos = roll(this.pos, best); this.tan = roll(this.tan, best);
      this.right = roll(this.right, best); this.curv = roll(this.curv, best);
      this.curvSm = roll(this.curvSm, best); this.curvAhead = roll(this.curvAhead, best);
      this.cum = null;
      acc = 0; this.cum = [];
      for (let i = 0; i < N; i++) {
        if (i > 0) acc += this.pos[i].distanceTo(this.pos[i - 1]);
        this.cum.push(acc);
      }
      this.length = acc + this.pos[N - 1].distanceTo(this.pos[0]);
    }
    this.startIdx = 0;
    this.startS = 0;
    // 控制点定位
    this.ctrlS = def.pts.map((p) => this.nearestTo(new THREE.Vector3(p[0] * def.scale, p[1] * def.scale, p[2] * def.scale)).s);
  }

  segLen(i) {
    const j = (i + 1) % this.N;
    if (i === this.N - 1) return this.length - this.cum[i];
    return this.cum[j] - this.cum[i];
  }

  wrap(s) { return ((s % this.length) + this.length) % this.length; }
  idxOfS(s) { s = this.wrap(s); let lo = 0, hi = this.N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }

  sample(s) {
    s = this.wrap(s);
    const i = this.idxOfS(s);
    const j = (i + 1) % this.N;
    const seg = (i === this.N - 1) ? (this.length - this.cum[i]) : (this.cum[j] - this.cum[i]);
    const f = seg > 0 ? THREE.MathUtils.clamp((s - this.cum[i]) / seg, 0, 1) : 0;
    return {
      pos: new THREE.Vector3().lerpVectors(this.pos[i], this.pos[j], f),
      tan: new THREE.Vector3().lerpVectors(this.tan[i], this.tan[j], f).normalize(),
      right: new THREE.Vector3().lerpVectors(this.right[i], this.right[j], f).normalize(),
      curv: this.curvSm[i], y: THREE.MathUtils.lerp(this.pos[i].y, this.pos[j].y, f),
      idx: i,
    };
  }

  nearestTo(p, hint = -1) {
    let bi = 0, bd = Infinity;
    const scan = (from, to) => {
      for (let k = from; k < to; k++) {
        const i = ((k % this.N) + this.N) % this.N;
        const d = this.pos[i].distanceToSquared(p);
        if (d < bd) { bd = d; bi = i; }
      }
    };
    if (hint >= 0) {
      scan(hint - 26, hint + 26);
      if (bd > 900) { bd = Infinity; scan(0, this.N); } // 丢失太远则全局找
    } else scan(0, this.N);
    const s = this.cum[bi];
    const d = new THREE.Vector3().subVectors(p, this.pos[bi]);
    const l = d.dot(this.right[bi]);
    return { idx: bi, s, l, y: this.pos[bi].y };
  }

  aheadS(s, d) { return this.wrap(s + d); }
  sDiff(a, b) { // a-b 归一化到 [-len/2, len/2]
    let d = a - b;
    while (d > this.length / 2) d -= this.length;
    while (d < -this.length / 2) d += this.length;
    return d;
  }
}

function smooth(arr, w) {
  const n = arr.length, out = new Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -w; k <= w; k++) s += arr[(i + k + n * 2) % n];
    out[i] = s / (2 * w + 1);
  }
  return out;
}

function roll(arr, k) {
  const n = arr.length;
  return arr.map((_, i) => arr[(i + k) % n]);
}

// ---------- 赛道场景构建 ----------
export function buildTrackScene(track, scene, assets) {
  const def = track.def, th = def.theme;
  const group = new THREE.Group();
  scene.add(group);
  const N = track.N;

  // 天空渐变背景
  const skyCv = document.createElement('canvas'); skyCv.width = 4; skyCv.height = 256;
  const sc = skyCv.getContext('2d');
  const g = sc.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
  sc.fillStyle = g; sc.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(skyCv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(new THREE.Color(th.fog), 160, 620);
  scene.userData.theme = th;

  // 光照
  const hemi = new THREE.HemisphereLight(new THREE.Color(th.hemiSky), new THREE.Color(th.hemiGround), 1.05);
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(60, 120, 40);
  group.add(hemi, sun);

  // 地面（大圆盘 + 海滩外圈海面）
  const groundMat = new THREE.MeshToonMaterial({ color: new THREE.Color(th.ground) });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1800, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.35;
  group.add(ground);
  if (th.water) {
    const water = new THREE.Mesh(new THREE.CircleGeometry(2600, 64),
      new THREE.MeshToonMaterial({ color: new THREE.Color(th.water) }));
    water.rotation.x = -Math.PI / 2; water.position.y = -1.2;
    group.add(water);
  }

  // 路面
  const roadTex = makeRoadTexture(th.road);
  const roadGeo = ribbonGeometry(track, (i) => -ROAD_HALF, (i) => ROAD_HALF, 0.0, 0.06);
  const road = new THREE.Mesh(roadGeo, new THREE.MeshToonMaterial({ map: roadTex, color: 0xffffff }));
  group.add(road);

  // 路缘红白条纹
  const curbTex = makeCurbTexture();
  for (const side of [-1, 1]) {
    const geo = ribbonGeometry(track,
      (i) => side * (ROAD_HALF - 0.05), (i) => side * (ROAD_HALF + 0.75), 0.02, 0.05);
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: curbTex }));
    group.add(m);
  }

  // 护栏（糖果条纹矮墙）
  const railTex = makeRailTexture(th.accent);
  for (const side of [-1, 1]) {
    const geo = wallGeometry(track, side * (ROAD_HALF + 0.85), 0.95);
    const m = new THREE.Mesh(geo, new THREE.MeshToonMaterial({ map: railTex, side: THREE.DoubleSide }));
    group.add(m);
  }

  // 起跑线（格纹）
  const startGeo = ribbonGeometry(track,
    (i) => -ROAD_HALF, (i) => ROAD_HALF, 0.03, 0.06, track.startIdx, track.startIdx + 3);
  const startMesh = new THREE.Mesh(startGeo, new THREE.MeshToonMaterial({ map: makeCheckerTexture() }));
  group.add(startMesh);

  // 终点拱门
  {
    const arch = assets.arch.clone(true);
    const st = track.sample(track.startS + 2);
    arch.position.copy(st.pos).addScaledVector(st.right, 0);
    arch.position.y = st.y;
    arch.rotation.y = Math.atan2(st.tan.x, st.tan.z);
    group.add(arch);
  }

  // 加速带
  const pads = [];
  for (const pd of def.pads) {
    const s0 = track.ctrlS[pd.near];
    const padMesh = assets.boostpad.clone(true);
    const st = track.sample(s0);
    padMesh.position.copy(st.pos).addScaledVector(st.right, 0);
    padMesh.position.y = st.y;
    padMesh.rotation.y = Math.atan2(st.tan.x, st.tan.z);
    group.add(padMesh);
    pads.push({ s: s0, halfS: 3.0, mesh: padMesh });
  }

  // 坡道起跳区（路面渐升由样条 y 自带；这里只登记触发区）
  const ramps = def.ramps.map(r => ({ s0: track.ctrlS[r.near], len: r.len, k: r.k }));

  // 道具箱刷新点
  const itemSpots = [];
  if (def.items) {
    for (const it of def.items) {
      const s0 = track.ctrlS[it.near];
      for (const lane of [-3.6, 0, 3.6]) {
        itemSpots.push({ s: track.wrap(s0 + lane * 0.8), l: lane, box: null, respawnAt: 0 });
      }
    }
  }

  // 装饰道具（两侧树）
  const propProto = assets[th.prop];
  const propNames = { palm: 1, sakura: 1, snowtree: 1 };
  let rng = mulberry(1234 + def.pts.length);
  const step = Math.floor(N / 90);
  for (let i = 0; i < N; i += step) {
    for (const side of [-1, 1]) {
      if (rng() < 0.35) continue;
      const off = ROAD_HALF + 3.5 + rng() * 12;
      const p = track.pos[i].clone().addScaledVector(track.right[i], side * off);
      p.y = track.pos[i].y - 0.25;
      const tree = propProto.clone(true);
      tree.position.copy(p);
      const sc2 = 0.8 + rng() * 0.7;
      tree.scale.setScalar(sc2);
      tree.rotation.y = rng() * Math.PI * 2;
      group.add(tree);
    }
  }
  // 路牌
  for (let k = 0; k < 6; k++) {
    const i = Math.floor(N * (k + 0.5) / 6);
    const side = k % 2 ? 1 : -1;
    const p = track.pos[i].clone().addScaledVector(track.right[i], side * (ROAD_HALF + 2.0));
    p.y = track.pos[i].y;
    const sign = assets.sign.clone(true);
    sign.position.copy(p);
    sign.rotation.y = Math.atan2(track.tan[i].x, track.tan[i].z) + (side > 0 ? Math.PI : 0);
    group.add(sign);
  }

  // 云朵精灵 + 太阳
  const cloudTex = makeCloudTexture();
  for (let k = 0; k < 18; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false }));
    const ang = rng() * Math.PI * 2, rr = 120 + rng() * 320;
    sp.position.set(Math.cos(ang) * rr, 55 + rng() * 60, Math.sin(ang) * rr);
    const s2 = 40 + rng() * 55;
    sp.scale.set(s2, s2 * 0.55, 1);
    group.add(sp);
  }
  const sunSp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSunTexture(), transparent: true, depthWrite: false }));
  sunSp.position.set(220, 190, 160); sunSp.scale.set(70, 70, 1);
  group.add(sunSp);

  // 小地图路径
  const mm = [];
  for (let i = 0; i < N; i += 10) mm.push(track.pos[i]);
  return { group, pads, ramps, itemSpots, minimapPts: mm, propNames };
}

// ---------- 几何工具 ----------
function ribbonGeometry(track, lf, rf, yOff, uvScale, i0 = 0, i1v = null) {
  // 沿采样圈生成条带；i0/i1v 限定区间（用于起跑线）
  const N = track.N;
  const count = i1v === null ? N : (i1v - i0);
  const posArr = [], uvArr = [], idxArr = [];
  for (let k = 0; k <= count; k++) {
    const i = (i0 + k) % N;
    const p = track.pos[i], r = track.right[i];
    const l = p.clone().addScaledVector(r, lf(i)); l.y += yOff;
    const rr = p.clone().addScaledVector(r, rf(i)); rr.y += yOff;
    posArr.push(l.x, l.y, l.z, rr.x, rr.y, rr.z);
    const v = track.cum[i] * uvScale * 0.12;
    uvArr.push(0, v, 1, v);
  }
  for (let k = 0; k < count; k++) {
    const a = k * 2, b = k * 2 + 1, c = k * 2 + 2, d = k * 2 + 3;
    idxArr.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();
  return geo;
}

function wallGeometry(track, lateral, height) {
  const N = track.N;
  const posArr = [], uvArr = [], idxArr = [];
  for (let i = 0; i <= N; i++) {
    const ii = i % N;
    const p = track.pos[ii], r = track.right[ii];
    const a = p.clone().addScaledVector(r, lateral); a.y += 0.25;
    const b = a.clone(); b.y += height;
    posArr.push(a.x, a.y, a.z, b.x, b.y, b.z);
    const v = track.cum[ii] * 0.1;
    uvArr.push(0, v, 1, v);
  }
  for (let i = 0; i < N; i++) {
    const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
    idxArr.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  geo.setIndex(idxArr);
  geo.computeVertexNormals();
  return geo;
}

// ---------- 贴图 ----------
function makeRoadTexture(roadColor) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = roadColor; c.fillRect(0, 0, 256, 256);
  // 噪点
  for (let i = 0; i < 700; i++) {
    c.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    c.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 边线
  c.fillStyle = '#FFFFFF';
  c.fillRect(6, 0, 7, 256); c.fillRect(243, 0, 7, 256);
  // 中央虚线
  c.fillStyle = '#FFE08A';
  for (let y = 0; y < 256; y += 64) c.fillRect(125, y, 6, 34);
  const t = tex(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1);
  return t;
}
function makeCurbTexture() {
  const cv = document.createElement('canvas'); cv.width = 32; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#E8443A'; c.fillRect(0, 0, 32, 32);
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 32, 32, 32);
  return repTex(cv);
}
function makeRailTexture(accent) {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, 64, 64);
  c.fillStyle = accent; c.fillRect(0, 0, 32, 32); c.fillRect(32, 32, 32, 32);
  return repTex(cv);
}
function makeCheckerTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const c = cv.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) {
    c.fillStyle = (x + y) % 2 ? '#333' : '#FAFAFA';
    c.fillRect(x * 16, y * 16, 16, 16);
  }
  return repTex(cv);
}
function makeCloudTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 40, 4, 64, 40, 56);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.save();
  c.translate(64, 40); c.scale(1, 0.62); c.translate(-64, -40);
  c.beginPath(); c.arc(64, 40, 56, 0, Math.PI * 2); c.fill();
  c.restore();
  return tex(cv);
}
function makeSunTexture() {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 6, 64, 64, 62);
  g.addColorStop(0, 'rgba(255,250,220,1)');
  g.addColorStop(0.25, 'rgba(255,235,160,0.9)');
  g.addColorStop(1, 'rgba(255,220,120,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128);
  return tex(cv);
}
function tex(cv) { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
function repTex(cv) { const t = tex(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
