// ===== 主入口：渲染器 / 场景 / 界面流程 / 主循环 =====
import * as THREE from 'three';
import { CARS, TRACKS, REWARDS } from './config.js';
import { TrackData, buildTrackScene } from './track.js';
import { loadAll, setAssets, makeKartRig, toonify } from './models.js';
import { Race } from './race.js';
import { HUD } from './hud.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { AudioMan } from './audio.js';
import { setupTest } from './test.js';

window.__errs = [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errs.push('rej:' + String(e.reason)));

const STEP = 1 / 60;
const $ = id => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.3, 1100);
const scene = new THREE.Scene();

const input = new Input();
const audio = new AudioMan();
const hud = new HUD();

const save = loadSave();
const ctx = {
  state: 'loading', mode: 'speed', trackIdx: 0, carIdx: save.sel ?? 0,
  race: null, demoRace: null, frozen: false, paused: false,
  trackDatas: [], trackScenes: [], fxCache: [],
  assets: null, save, input, audio, hud, camera, renderer, scene,
  garage: null,
};
window.__ctx = ctx;

// ---------- 存档 ----------
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem('jisu-feiche-save'));
    if (s && typeof s === 'object') return { coins: 0, owned: [0, 1, 2, 3], sel: 0, best: {}, vol: 0.6, ghosts: {}, ...s };
  } catch (e) {}
  return { coins: 0, owned: [0, 1, 2, 3], sel: 0, best: {}, vol: 0.6, ghosts: {} };
}
function persist() {
  try { localStorage.setItem('jisu-feiche-save', JSON.stringify(save)); } catch (e) {}
}
function refreshCoins() {
  $('coins-menu').textContent = '💰 ' + save.coins;
  $('coins-garage').textContent = '💰 ' + save.coins;
}

// ---------- 赛道场景 ----------
function getTrack(i) {
  if (!ctx.trackDatas[i]) ctx.trackDatas[i] = new TrackData(TRACKS[i]);
  return ctx.trackDatas[i];
}
function mountTrack(i) {
  for (const g of ctx.trackScenes) if (g) scene.remove(g.group);
  if (!ctx.trackScenes[i]) {
    ctx.trackScenes[i] = buildTrackScene(getTrack(i), scene, ctx.assets);
    scene.add(ctx.trackScenes[i].group);
  } else {
    scene.add(ctx.trackScenes[i].group);
  }
  if (!ctx.fxCache[i]) ctx.fxCache[i] = new Effects(scene, TRACKS[i].theme);
  return ctx.trackScenes[i];
}

// ---------- 界面切换 ----------
function show(id) {
  for (const s of ['loading', 'menu', 'tracksel', 'garage', 'results', 'pause', 'help'])
    $(s).classList.add('hidden');
  if (id) $(id).classList.remove('hidden');
}
function setState(st) {
  ctx.state = st;
  hud.show(st === 'race');
  $('touch').classList.toggle('hidden', !(st === 'race' && input.isCoarse()));
}

function enterMenu() {
  stopRace();
  setState('menu');
  show('menu');
  refreshCoins();
  mountTrack(ctx.trackIdx);
  // 菜单背景：AI 演示赛
  ctx.demoRace = new Race({
    track: getTrack(ctx.trackIdx), trackScene: ctx.trackScenes[ctx.trackIdx],
    assets: ctx.assets, scene, camera, renderer, hud, input,
    fx: ctx.fxCache[ctx.trackIdx], audio, mode: 'speed', carIdx: ctx.carIdx, demo: true,
  });
  ctx.demoRace.phase = 'racing';
  if (audio.ctx && !audio.bgmTimer) audio.startBGM('menu');
}

function stopRace() {
  if (ctx.race) { ctx.race.dispose(); ctx.race = null; }
  if (ctx.demoRace) { ctx.demoRace.dispose(); ctx.demoRace = null; }
  audio.stopEngine();
}

function enterTracksel() {
  stopRace();
  setState('tracksel');
  show('tracksel');
  $('ts-title').textContent = (ctx.mode === 'item' ? '道具模式' : ctx.mode === 'tt' ? '计时赛 · 挑战幽灵' : '竞速模式') + ' · 选择赛道';
  const host = $('track-cards');
  host.innerHTML = '';
  const BADGES = ['🌱 新手', '🌸 进阶', '❄ 高手', '🍬 挑战'];
  const EMOJIS = ['🏖️', '🌸', '⛄', '🍬'];
  TRACKS.forEach((t, i) => {
    const card = document.createElement('div');
    card.className = 'tcard' + (i === ctx.trackIdx ? ' sel' : '');
    const best = ctx.mode === 'tt'
      ? (save.ghosts && save.ghosts[t.id] && save.ghosts[t.id].time)
      : save.best[t.id];
    card.innerHTML = `
      <div class="thumb" style="background:linear-gradient(160deg,${t.theme.skyTop},${t.theme.skyBottom})">
        <span class="badge">${BADGES[i] || ''}</span>
        <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:52px">${EMOJIS[i] || '🏁'}</span>
      </div>
      <div class="tinfo">
        <h3>${t.name}</h3><p>${t.desc}</p>
        <div class="stars">${'★'.repeat(t.diff)}${'☆'.repeat(3 - t.diff)}</div>
        <div class="best">🏆 最佳：${best ? fmtT(best) : '暂无'}</div>
      </div>`;
    card.onclick = () => { audio.sfx('click'); ctx.trackIdx = i; startRace(); };
    host.appendChild(card);
  });
}

function fmtT(ms) {
  const t = ms / 1000;
  const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t % 1) * 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function startRace() {
  stopRace();
  mountTrack(ctx.trackIdx);
  ctx.fxCache[ctx.trackIdx].resetSkids && ctx.fxCache[ctx.trackIdx].resetSkids();
  setState('race');
  show(null);
  ctx.race = new Race({
    track: getTrack(ctx.trackIdx), trackScene: ctx.trackScenes[ctx.trackIdx],
    assets: ctx.assets, scene, camera, renderer, hud, input,
    fx: ctx.fxCache[ctx.trackIdx], audio, mode: ctx.mode, carIdx: ctx.carIdx, save,
    onFinish: () => {
      audio.stopEngine();
    },
    onResults: (race) => {
      const p = race.player;
      const tid = TRACKS[ctx.trackIdx].id;
      const drift = Math.round(p.driftEarned * 4);
      let coins, reward;
      if (race.isTT) {
        // 计时赛：小奖励 + 幽灵存档
        save.ghosts = save.ghosts || {};
        const prev = save.ghosts[tid];
        let ghostPrev = prev ? prev.time / 1000 : undefined;
        coins = (p.finished ? 20 : 0) + drift;
        if (p.finished && (!prev || p.finishTime * 1000 < prev.time)) {
          let c = 0;
          const cumLaps = p.lapTimes.map(t => (c += t)).concat([p.finishTime]);
          let frames = race.ghostRec;
          const blob = JSON.stringify(frames);
          if (blob.length > 260000) {  // 体积保护：隔帧抽稀
            frames = frames.filter((_, k) => k % 2 === 0);
          }
          save.ghosts[tid] = { time: Math.round(p.finishTime * 1000), laps: cumLaps, frames };
        }
        reward = { coins, ghostPrev };
      } else {
        const rank = race.rankOf(p);
        const base = REWARDS[rank - 1];
        coins = base + drift;
        reward = { coins, base, drift };
      }
      save.coins += coins;
      let record = false;
      if (p.finished && (!save.best[tid] || p.finishTime * 1000 < save.best[tid])) {
        save.best[tid] = Math.round(p.finishTime * 1000);
        record = true;
      }
      persist(); refreshCoins();
      $('res-card').innerHTML = hud.resultsHTML(race, reward) +
        (record ? '<div class="res-coins" style="color:#E0568C">🌟 新纪录！</div>' : '');
      setState('results');
      show('results');
      audio.stopBGM();
    },
  });
  ctx.race.start();
  audio.startEngine();
  audio.startBGM('race', [0, 2, -3, 4][ctx.trackIdx] || 0);
}

// ---------- 车库 ----------
function enterGarage() {
  stopRace();
  setState('garage');
  show('garage');
  refreshCoins();
  if (!ctx.garage) {
    const gs = new THREE.Scene();
    gs.background = new THREE.Color('#BFE3F5');
    gs.fog = new THREE.Fog('#DFF0FA', 20, 80);
    gs.add(new THREE.HemisphereLight(0xffffff, 0xE8D9C8, 1.1));
    const dl = new THREE.DirectionalLight(0xffffff, 1.2); dl.position.set(5, 8, 4); gs.add(dl);
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 0.5, 40),
      new THREE.MeshToonMaterial({ color: 0xF0F4FA }));
    podium.position.y = -0.25; gs.add(podium);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.09, 10, 60),
      new THREE.MeshBasicMaterial({ color: 0xFFB25A }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; gs.add(ring);
    ctx.garage = { scene: gs, rig: null, t: 0 };
  }
  setGarageCar(ctx.carIdx);
}
function setGarageCar(i) {
  const g = ctx.garage;
  if (g.rig) g.scene.remove(g.rig.root);
  g.rig = makeKartRig(i);
  g.rig.root.position.y = 0.02;
  g.scene.add(g.rig.root);
  const c = CARS[i];
  $('g-name').textContent = c.name;
  $('g-name').style.color = c.color;
  $('g-desc').textContent = c.desc;
  const st = c.stats;
  $('g-stats').innerHTML = [
    ['极速', st.speed], ['加速', st.accel], ['集气', st.drift], ['操控', st.handling],
  ].map(([n, v], k) => {
    const pct = Math.round(Math.max(15, Math.min(100, (v - 0.9) / 0.25 * 100)));
    return `<div class="stat-row ${k >= 2 ? 'd' : ''}"><label>${n}</label><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const owned = save.owned.includes(i);
  if (owned) {
    $('g-price').textContent = '';
    $('g-action').textContent = save.sel === i ? '✓ 当前座驾' : '驾驶此车';
    $('g-action').disabled = save.sel === i;
    $('g-action').className = '';
  } else {
    $('g-price').textContent = '💰 价格：' + c.price;
    $('g-action').textContent = save.coins >= c.price ? '购买' : '金币不足';
    $('g-action').disabled = save.coins < c.price;
    $('g-action').className = 'pink';
  }
  $('g-action').onclick = () => {
    if (save.owned.includes(i)) {
      save.sel = i; ctx.carIdx = i; audio.sfx('click');
    } else if (save.coins >= c.price) {
      save.coins -= c.price; save.owned.push(i); save.sel = i; ctx.carIdx = i;
      audio.sfx('buy');
    } else { audio.sfx('deny'); return; }
    persist(); refreshCoins(); setGarageCar(i);
  };
}

// ---------- 按钮 ----------
ctx.startRacePublic = startRace;   // 测试钩子可调用的真实开赛入口
$('btn-speed').onclick = () => { audio.unlock(); audio.sfx('click'); ctx.mode = 'speed'; enterTracksel(); };
$('btn-item').onclick = () => { audio.unlock(); audio.sfx('click'); ctx.mode = 'item'; enterTracksel(); };
$('btn-tt').onclick = () => { audio.unlock(); audio.sfx('click'); ctx.mode = 'tt'; enterTracksel(); };
$('btn-garage').onclick = () => { audio.unlock(); audio.sfx('click'); enterGarage(); };
$('btn-help').onclick = () => { audio.unlock(); audio.sfx('click'); show('help'); };
$('help-close').onclick = () => { audio.sfx('click'); show(ctx.state === 'menu' ? 'menu' : null); };
$('ts-back').onclick = () => { audio.sfx('click'); enterMenu(); };
$('g-back').onclick = () => { audio.sfx('click'); enterMenu(); };
$('garage-prev').onclick = () => { audio.sfx('click'); ctx.carIdx = (ctx.carIdx + CARS.length - 1) % CARS.length; setGarageCar(ctx.carIdx); };
$('garage-next').onclick = () => { audio.sfx('click'); ctx.carIdx = (ctx.carIdx + 1) % CARS.length; setGarageCar(ctx.carIdx); };
$('res-again').onclick = () => { audio.sfx('click'); startRace(); };
$('res-tracks').onclick = () => { audio.sfx('click'); enterTracksel(); };
$('res-menu').onclick = () => { audio.sfx('click'); enterMenu(); };
$('p-resume').onclick = () => { ctx.paused = false; show(null); setState('race'); };
$('p-restart').onclick = () => { ctx.paused = false; startRace(); };
$('p-quit').onclick = () => { ctx.paused = false; enterMenu(); };
$('p-vol').oninput = e => {
  audio.setVolume(e.target.value / 100); $('p-vol-n').textContent = e.target.value;
  save.vol = e.target.value / 100; persist();
};
// 应用已存音量
audio.setVolume(save.vol ?? 0.6);
$('p-vol').value = Math.round((save.vol ?? 0.6) * 100);
$('p-vol-n').textContent = Math.round((save.vol ?? 0.6) * 100);
$('hud-pause').onclick = () => {
  if (ctx.state === 'race' && ctx.race && !ctx.paused) {
    ctx.paused = true; show('pause'); audio.stopEngine();
  }
};
addEventListener('keydown', e => {
  if (e.code === 'Escape' && ctx.state === 'race' && ctx.race) {
    ctx.paused = !ctx.paused;
    if (ctx.paused) { show('pause'); audio.stopEngine(); }
    else { show(null); audio.startEngine(); }
  }
});
// 首次手势解锁音频
const unlock = () => {
  audio.unlock();
  if (ctx.state === 'menu' && !audio.bgmTimer) audio.startBGM('menu');
};
addEventListener('pointerdown', unlock, { once: false });
addEventListener('keydown', unlock, { once: false });

// ---------- 主循环 ----------
let last = performance.now(), acc = 0;
// 自适应分辨率：持续掉帧则降 pixelRatio（移动端保帧率）
let frameEMA = 16, perfT = 0, dpr = Math.min(devicePixelRatio, 2);
renderer.setPixelRatio(dpr);
// 切后台自动暂停比赛
document.addEventListener('visibilitychange', () => {
  if (document.hidden && ctx.state === 'race' && ctx.race && !ctx.paused) {
    ctx.paused = true; show('pause'); audio.stopEngine();
  }
});
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.12);
  // 帧率监测（仅比赛中）
  if (ctx.state === 'race' && !ctx.paused) {
    frameEMA = frameEMA * 0.95 + (dt * 1000) * 0.05;
    perfT += dt;
    if (perfT > 3) {
      perfT = 0;
      if (frameEMA > 26 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); }
    }
  }
  const lines = $('speedlines');
  if (lines.width !== innerWidth) { lines.width = innerWidth; lines.height = innerHeight; }

  if (!ctx.frozen) {
    if (ctx.state === 'race' && ctx.race && !ctx.paused) {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 6) {
        ctx.race.update(STEP, renderer);
        window.__testUpdate && window.__testUpdate(STEP);
        acc -= STEP; n++;
      }
      if (n >= 6) acc = 0;
    } else if (ctx.state === 'menu' && ctx.demoRace) {
      acc += dt; let n = 0;
      while (acc >= STEP && n < 5) { ctx.demoRace.update(STEP, renderer); acc -= STEP; n++; }
      if (n >= 5) acc = 0;
    } else if (ctx.state === 'garage' && ctx.garage) {
      const g = ctx.garage;
      g.t += dt;
      if (g.rig) g.rig.root.rotation.y = g.t * 0.7;
      const r = 7.2;
      camera.position.set(Math.sin(g.t * 0.18) * r, 3.1, Math.cos(g.t * 0.18) * r);
      camera.lookAt(0, 0.7, 0);
      if (camera.fov !== 55) { camera.fov = 55; camera.updateProjectionMatrix(); }
    }
  }
  if (ctx.state === 'garage' && ctx.garage) renderer.render(ctx.garage.scene, camera);
  else renderer.render(scene, camera);
}
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- 启动 ----------
(async () => {
  try {
    ctx.assets = await loadAll((d, n, key) => {
      $('load-fill').style.width = Math.round(d / n * 100) + '%';
      $('load-text').textContent = `正在载入模型 (${d}/${n})…`;
    });
    setAssets(ctx.assets);
    $('load-text').textContent = '正在铺设赛道…';
    await new Promise(r => setTimeout(r, 60));
    enterMenu();
    setupTest(ctx);
  } catch (e) {
    window.__errs.push('boot:' + String(e && e.message || e));
    $('load-text').textContent = '载入失败：' + (e && e.message);
  }
})();
requestAnimationFrame(frame);
