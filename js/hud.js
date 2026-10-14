// ===== HUD：名次 / 圈数 / 小地图 / 氮气槽 / 速度表 / 道具槽 =====
import { ITEMS } from './config.js';

const MEDALS = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣'];
const RANK_COLORS = ['#FFC400', '#C7D2E0', '#E08A4E', '#8FD0FF', '#8FD0FF', '#8FD0FF'];

export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.posEl = document.getElementById('hud-pos');
    this.lapEl = document.getElementById('hud-lap');
    this.timeEl = document.getElementById('hud-time');
    this.speedEl = document.getElementById('hud-speed-num');
    this.nitroFill = document.getElementById('nitro-fill');
    this.nitroBar = document.getElementById('nitro-bar');
    this.itemEl = document.getElementById('hud-item');
    this.msgEl = document.getElementById('msg-center');
    this.mm = document.getElementById('minimap');
    this.mmc = this.mm ? this.mm.getContext('2d') : null;
    this.msgTimer = 0;
    this._mmInit = false;
    this._acc = 0;
  }

  show(v) { this.root.classList.toggle('hidden', !v); }
  showItemSlot(v) { this.itemEl.classList.toggle('hidden', !v); }

  setItem(key) {
    if (!key) { this.itemEl.innerHTML = ''; this.itemEl.classList.remove('has'); return; }
    const it = ITEMS[key];
    this.itemEl.innerHTML = `<span class="item-ic">${it.icon}</span>`;
    this.itemEl.classList.add('has');
  }

  setMsg(text, cls = '') {
    this.msgEl.textContent = text;
    this.msgEl.className = 'show ' + cls;
    this.msgTimer = text.length > 3 ? 1.6 : 1.1;
  }

  fmtTime(t) {
    if (!isFinite(t)) return "--:--.--";
    const m = Math.floor(t / 60), s = Math.floor(t % 60), c = Math.floor((t % 1) * 100);
    return `${m}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
  }

  update(race) {
    const p = race.player;
    const rank = race.rankOf(p);
    this._acc += 1;
    const heavy = this._acc % 3 === 0;   // 高频 DOM 写入节流

    this.posEl.innerHTML = `<b style="color:${RANK_COLORS[rank - 1]}">${rank}</b><i>/6</i>`;
    this.lapEl.textContent = `第 ${Math.min(p.lap + 1, race.laps)}/${race.laps} 圈`;
    this.timeEl.textContent = this.fmtTime(p.raceTime);
    const kmh = Math.round(Math.abs(p.speed) * 7.4);
    if (heavy) this.speedEl.textContent = kmh;

    // 氮气槽
    const pct = (p.nitroCharge / 2) * 100;
    this.nitroFill.style.width = pct + '%';
    this.nitroBar.classList.toggle('ready1', p.nitroCharge >= 1);
    this.nitroBar.classList.toggle('ready2', p.nitroCharge >= 2);
    this.nitroBar.classList.toggle('boosting', p.nitroTimer > 0);

    if (this.msgTimer > 0) {
      this.msgTimer -= 1 / 60;
      if (this.msgTimer <= 0) this.msgEl.className = '';
    }
    if (heavy) this.drawMinimap(race);
  }

  drawMinimap(race) {
    if (!this.mmc) return;
    const cv = this.mm, c = this.mmc;
    const W = cv.width, H = cv.height;
    const pts = race.trackScene.minimapPts;
    if (!this._mmInit) {
      // 计算包围盒 + 变换
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      }
      const pad = 16;
      const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
      this._mmT = (x, z) => [pad + (x - minX) * sc + (W - pad * 2 - (maxX - minX) * sc) / 2,
        pad + (z - minZ) * sc + (H - pad * 2 - (maxZ - minZ) * sc) / 2];
      this._mmInit = true;
    }
    c.clearRect(0, 0, W, H);
    // 底图轨道
    c.beginPath();
    pts.forEach((p, i) => {
      const [x, y] = this._mmT(p.x, p.z);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    });
    c.closePath();
    c.lineWidth = 9; c.strokeStyle = 'rgba(60,54,80,0.35)'; c.stroke();
    c.lineWidth = 6; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
    c.lineWidth = 1.6; c.strokeStyle = 'rgba(255,170,60,0.9)'; c.stroke();
    // 起点线
    const st = race.track.sample(race.track.startS);
    const [sx, sy] = this._mmT(st.pos.x, st.pos.z);
    c.fillStyle = '#3A3450';
    c.fillRect(sx - 3, sy - 3, 6, 6);
    // 道具箱
    if (race.itemSys) {
      c.fillStyle = '#4EC9FF';
      for (const b of race.itemSys.boxes) {
        if (b.taken) continue;
        const [x, y] = this._mmT(b.mesh.position.x, b.mesh.position.z);
        c.fillRect(x - 2, y - 2, 4, 4);
      }
    }
    // 车手
    for (const k of race.karts) {
      const [x, y] = this._mmT(k.pos.x, k.pos.z);
      c.beginPath();
      c.arc(x, y, k.isPlayer ? 5 : 3.6, 0, Math.PI * 2);
      c.fillStyle = k.isPlayer ? '#FF7A00' : k.color;
      c.fill();
      if (k.isPlayer) { c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); }
    }
  }

  resultsHTML(race, reward) {
    const rows = race.rankCache.map((k, i) => {
      const t = k.finished ? this.fmtTime(k.finishTime) : '未完赛';
      const best = isFinite(k.bestLap) ? this.fmtTime(k.bestLap) : '--';
      return `<tr class="${k.isPlayer ? 'me' : ''}">
        <td>${MEDALS[i]}</td><td>${k.name}</td><td>${t}</td><td>${best}</td></tr>`;
    }).join('');
    const rank = race.rankOf(race.player);
    return `<div class="res-rank">${MEDALS[rank - 1]} 第 ${rank} 名</div>
      <table class="res-table"><tr><th></th><th>车手</th><th>总成绩</th><th>最佳单圈</th></tr>${rows}</table>
      <div class="res-coins">💰 金币 +${reward.coins}（名次 ${reward.base} + 漂移加成 ${reward.drift}）</div>`;
  }
}
