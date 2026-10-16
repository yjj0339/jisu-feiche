// ===== 比赛管理：倒计时 / 车阵 / 相机 / 名次 / 事件分发 =====
import * as THREE from 'three';
import { Kart, collideKarts } from './physics.js';
import { AIDriver } from './ai.js';
import { makeKartRig } from './models.js';
import { ItemSystem } from './items.js';
import { ROAD_HALF, AI_DRIVERS, CARS } from './config.js';

export class Race {
  constructor(opts) {
    // opts: {track, trackScene, assets, scene, camera, renderer, hud, fx, audio, input, mode:'speed'|'item'|'tt', carIdx, save, onFinish, demo}
    Object.assign(this, opts);
    this.demo = !!opts.demo;
    this.isTT = this.mode === 'tt';
    this.laps = opts.demo ? 99 : opts.track.def.laps;
    this.karts = [];
    this.rigs = [];
    this.aiDrivers = new Map();
    this.phase = 'countdown';   // countdown / racing / done
    this.countdown = 3.8;
    this.player = null;
    this.rankCache = [];
    this.finishOrder = [];
    this.msgQueue = [];
    this.time = 0;
    this.perfectWindow = 0;
    this.throttleHeldAt = -1;
    this.camPos = new THREE.Vector3();
    this.camInit = false;
    this.itemSys = null;
    this.shakeT = 0;
    this.wrongT = 0;
    this.wrongShown = false;
    this.ghostRig = null;
    this.ghostRec = [];
    this.ghostRecAcc = 0;
    this.setupKarts();
    if (this.demo) {
      // 演示模式：玩家车也由 AI 驾驶，直接开跑
      this.phase = 'racing';
      this.aiDrivers.set(this.player, new AIDriver(this.track, 0.95, 0));
    }
    if (this.isTT) {
      this.setupGhost();
      this.hud.showItemSlot(false);
      this.hud.setTT(true);
    } else {
      this.hud.setTT(false);
      if (this.mode === 'item') {
        this.itemSys = new ItemSystem(this.track, this, this.assets, this.scene, this.fx, this.audio);
        this.itemSys.setup(this.trackScene.itemSpots);
      }
      this.hud.showItemSlot(this.mode === 'item');
    }
  }

  // 计时赛幽灵：加载历史最佳并准备回放
  setupGhost() {
    const ghosts = (this.save && this.save.ghosts) || {};
    const g = ghosts[this.track.def.id];
    this.ghostData = g || null;
    if (g && g.frames && g.frames.length > 10 && !this.demo) {
      const rig = makeKartRig(this.carIdx);
      rig.root.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.35;
          o.material.depthWrite = false;
        } else if (o.isSprite) {
          o.visible = false;
        }
      });
      if (rig.shadow) rig.shadow.visible = false;
      for (const f of rig.flameMeshes) f.visible = false;
      this.scene.add(rig.root);
      this.ghostRig = rig;
    }
  }

  ghostPose(t) {
    const fr = this.ghostData.frames;
    if (!fr || fr.length < 2) return null;
    if (t <= fr[0][0]) return fr[0];
    if (t >= fr[fr.length - 1][0]) return fr[fr.length - 1];
    let lo = 0, hi = fr.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (fr[mid][0] <= t) lo = mid; else hi = mid; }
    const a = fr[lo], b = fr[hi];
    const f = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
    let dh = b[4] - a[4];
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f, a[4] + dh * f];
  }

  setupKarts() {
    const grid = [];
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      grid.push({ s: this.track.wrap(this.track.startS - 9 - row * 6.5), l: side * 2.4 });
    }
    // 玩家最后一排（QQ飞车习惯：主角后发）
    const order = [0, 1, 2, 3, 4, 5];
    const playerGrid = grid[5];
    grid[5] = grid[0]; grid[0] = playerGrid;
    const playerCar = this.carIdx;
    const aiCars = AI_DRIVERS.map(d => d.kart).filter(c => true);
    for (let i = 0; i < (this.isTT ? 1 : 6); i++) {
      const isPlayer = i === 0;
      let carIdx, name, color, stats;
      if (isPlayer) {
        carIdx = playerCar; name = '你'; color = CARS[playerCar].color;
        stats = CARS[playerCar].stats;
      } else {
        const d = AI_DRIVERS[i - 1];
        carIdx = d.kart === playerCar ? (d.kart + 1) % 6 : d.kart;
        name = d.name; color = CARS[carIdx].color;
        stats = CARS[carIdx].stats;
      }
      const kart = new Kart(this.track, { name, carIdx, stats, color, isPlayer });
      kart.placeAt(grid[i].s, grid[i].l);
      kart.lap = 0;
      const rig = makeKartRig(carIdx);
      this.scene.add(rig.root);
      this.scene.add(rig.shadow);
      this.karts.push(kart); this.rigs.push(rig);
      if (isPlayer) this.player = kart;
      else {
        const skillBase = [0.985, 0.962, 1.0, 0.952, 0.972][i - 1] * (1 + (this.track.def.diff - 2) * 0.015);
        this.aiDrivers.set(kart, new AIDriver(this.track, skillBase, (i % 3 - 1) * 2.2));
      }
    }
  }

  rankOf(kart) {
    return this.rankCache.indexOf(kart) + 1;
  }

  start() {
    this.hud.setMsg('3', 'count');
    this.audio.sfx('count');
  }

  update(dt, renderer) {
    this.time += dt;
    if (this.phase === 'countdown') {
      this.updateCountdown(dt);
    }
    const racing = this.phase === 'racing' || this.phase === 'done';

    // 输入（玩家每帧采样一次并缓存，供 syncRig 复用）
    this._playerInput = this.demo ? null : this.input.sample();
    for (let i = 0; i < this.karts.length; i++) {
      const kart = this.karts[i];
      let input;
      if (kart.isPlayer && !this.demo) {
        input = { ...this._playerInput };
        // 完美起步检测：倒计时最后阶段按住油门（读原始输入，油门在倒计时中被清零）
        if (this.phase === 'countdown' && this._playerInput.throttle > 0 && this.throttleHeldAt < 0) this.throttleHeldAt = this.countdown;
        if (!racing) { input.throttle = 0; input.steer = 0; input.drift = false; input.nitro = false; }
      } else {
        input = { steer: 0, throttle: 1, brake: 0, drift: false, nitro: false, item: false, reset: false };
        if (racing) {
          const ai = this.aiDrivers.get(kart);
          ai.decide(kart, this, input, dt);
        } else { input.throttle = 0; }
      }
      // 道具使用：有道具时 Ctrl 消耗道具；否则作为氮气意图
      if (kart.item && input.item) {
        if (this.itemSys) this.itemSys.use(kart);
        else if (kart.item === 'boost') { kart.item = null; kart.nitroCharge = Math.min(2, kart.nitroCharge + 1); }
        else kart.item = null;
        input.nitro = false;
      }
      kart.step(dt, racing ? input : { ...input, throttle: 0, drift: false, nitro: false }, this);
    }

    collideKarts(this.karts);

    // 名次
    this.rankCache = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });

    // 事件消费
    for (const kart of this.karts) {
      for (const ev of kart.ev) this.handleEvent(kart, ev);
    }

    // 道具系统
    if (this.itemSys) {
      this.itemSys.update(dt);
      this.itemSys.updateBubbles(this.karts, dt);
    }

    // 计时赛：幽灵录制与回放
    if (this.isTT && !this.demo && !this.player.finished) {
      this.ghostRecAcc += dt;
      if (this.ghostRecAcc >= 0.1) {
        this.ghostRecAcc = 0;
        const p = this.player;
        this.ghostRec.push([+p.raceTime.toFixed(2),
          +p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.heading.toFixed(3)]);
        if (this.ghostRec.length > 2400) this.ghostRec.shift();
      }
      if (this.ghostRig) {
        const pose = this.ghostPose(this.player.raceTime);
        if (pose) {
          this.ghostRig.root.position.set(pose[1], pose[2], pose[3]);
          this.ghostRig.root.rotation.y = pose[4];
        }
      }
    }

    // 逆行检测（玩家）
    if (!this.demo && this.phase === 'racing') {
      const p = this.player;
      const ds = this.track.sDiff(p.s, p.sPrev === undefined ? p.s : p.sPrev);
      p.sPrev = p.s;
      if (ds < -0.02 && Math.abs(p.speed) > 4) this.wrongT += dt;
      else this.wrongT = Math.max(0, this.wrongT - dt * 2);
      const wrong = this.wrongT > 1.2;
      if (wrong !== this.wrongShown) { this.wrongShown = wrong; this.hud.setWrong(wrong); }
    }

    // 视觉同步
    for (let i = 0; i < this.karts.length; i++) this.syncRig(this.karts[i], this.rigs[i], dt);
    this.fx.update(dt);

    // 相机
    this.updateCamera(dt);

    // HUD
    if (!this.demo) this.hud.update(this);

    // 玩家完赛 → 收尾
    if (!this.demo && this.player.finished && this.phase === 'racing') {
      this.phase = 'done';
      this.audio.sfx('finish');
      this.fx.confetti();
      this.onFinish && this.onFinish(this);
    }
    // 全员完赛/超时 → 展示结算
    if (this.phase === 'done') {
      const alive = this.karts.filter(k => !k.finished);
      if (alive.length === 0 || this.time > this.player.finishTime + 9) {
        for (const k of alive) { k.finished = true; k.finishTime = k.raceTime; }
        this.phase = 'results';
        this.onResults && this.onResults(this);
      }
    }
  }

  updateCountdown(dt) {
    const prev = Math.ceil(this.countdown);
    this.countdown -= dt;
    const cur = Math.ceil(this.countdown);
    if (cur !== prev && cur >= 1 && cur <= 3) {
      this.hud.setMsg(String(cur), 'count');
      this.audio.sfx('count');
    }
    if (this.countdown <= 0.55 && this.perfectWindow === 0) {
      this.perfectWindow = 1;
      this.hud.setMsg('预备…', 'count small');
    }
    if (this.countdown <= 0) {
      this.phase = 'racing';
      this.hud.setMsg('GO!', 'go');
      this.audio.sfx('go');
      // 完美起步
      if (this.throttleHeldAt > 0 && this.throttleHeldAt < 0.85) {
        this.player.speed = this.player.maxSpeed * 0.85;
        this.player.miniTimer = 1.0;
        this.hud.setMsg('完美起步！', 'perfect');
        this.audio.sfx('perfect');
      }
    }
  }

  handleEvent(kart, ev) {
    const isP = kart.isPlayer;
    switch (ev) {
      case 'driftstart': if (isP) this.audio.sfx('driftstart'); break;
      case 'driftend': break;
      case 'miniboost':
        if (isP) {
          this.audio.sfx('miniboost');
          const r = kart.lastMiniRating || 'good';
          if (kart.comboMini >= 2) this.hud.setMsg(`连喷 x${kart.comboMini}！`, 'perfect');
          else if (r === 'perfect') this.hud.setMsg('PERFECT 漂移！', 'perfect');
          else if (r === 'great') this.hud.setMsg('漂移 GREAT！', 'great');
          else this.hud.setMsg('小喷！', 'mini');
          this.fx.setSpeedLines(0.35);
        }
        this.fx.burst(kart.pos.clone().setY(kart.pos.y + 0.3), '#FFC96A', 8, 4, 0.8);
        break;
      case 'doublespray':
        if (isP) { this.hud.setMsg('双喷！！', 'go'); this.audio.sfx('perfect'); this.fx.setSpeedLines(1.2); }
        break;
      case 'landboost':
        if (isP) { this.audio.sfx('landboost'); this.hud.setMsg('落地喷！', 'mini'); }
        this.fx.burst(kart.pos.clone().setY(kart.pos.y + 0.2), '#E8D9C8', 10, 5, 0.9);
        break;
      case 'nitro':
        if (isP) { this.audio.sfx('nitro'); this.hud.setMsg('氮气爆发！', 'nitro'); this.fx.setSpeedLines(1); }
        this.shakeT = 0.3;
        break;
      case 'pad':
        if (isP) { this.audio.sfx('pad'); this.fx.setSpeedLines(0.6); }
        break;
      case 'ramp': if (isP) this.audio.sfx('ramp'); break;
      case 'land': if (isP) this.audio.sfx('land'); break;
      case 'wall': if (isP) this.audio.sfx('wall'); break;
      case 'bump': if (isP) this.audio.sfx('bump'); break;
      case 'lap':
        if (isP) {
          this.audio.sfx(kart.lap === this.laps - 1 ? 'final' : 'lap');
          if (kart.lap === this.laps - 1) this.hud.setMsg('最后一圈！', 'final');
          // 计时赛：与幽灵同圈用时对比
          if (this.isTT && this.ghostData && this.ghostData.laps) {
            const gl = this.ghostData.laps[kart.lap - 1];
            if (gl !== undefined) this.hud.setDelta(kart.raceTime - gl);
          }
        }
        break;
      case 'finish':
        if (isP) this.hud.setMsg('完赛！', 'finish');
        else this.audio.sfx('coin');
        break;
      case 'respawn': if (isP) this.audio.sfx('respawn'); break;
      case 'spin': if (isP) { this.audio.sfx('spin'); this.shakeT = 0.4; this.hud.setMsg('被击中！', 'bad'); } break;
      case 'shieldblock': if (isP) this.audio.sfx('shieldblock'); break;
    }
  }

  syncRig(kart, rig, dt) {
    rig.root.position.copy(kart.pos);
    // 视觉偏航 = 航向 + 漂移侧滑角 + 打滑旋转
    let visYaw = kart.heading + kart.slip * 0.9;
    if (kart.spinTimer > 0) visYaw += (1.6 - kart.spinTimer) * Math.PI * 4;
    rig.root.rotation.y = visYaw;
    // 车身侧倾/俯仰
    const lean = kart.drifting ? kart.driftDir * 0.13 : 0;
    const pitch = kart.grounded ? -kart.speed * 0.0016 : THREE.MathUtils.clamp(-kart.vy * 0.02, -0.25, 0.3);
    if (rig.model) {
      rig.model.rotation.z = THREE.MathUtils.lerp(rig.model.rotation.z, lean, 0.2);
      rig.model.rotation.x = THREE.MathUtils.lerp(rig.model.rotation.x, pitch, 0.15);
    }
    // 车轮
    const spin = kart.speed * dt / 0.3;
    for (const key in rig.spins) rig.spins[key].rotation.x += spin;
    if (rig.wheels.FL) rig.wheels.FL.rotation.y = 0.35 * (this.inputLastSteer || 0);
    if (rig.wheels.FR) rig.wheels.FR.rotation.y = 0.35 * (this.inputLastSteer || 0);
    // 火焰
    const boost = kart.anyBoost();
    for (const f of rig.flameMeshes) {
      f.visible = boost;
      if (boost) {
        const s = 0.8 + Math.random() * 0.5 + (kart.nitroTimer > 0 ? 0.5 : 0);
        if (f.isSprite) f.scale.setScalar(0.55 * s + 0.25);
        else f.scale.set(1, s, 1);
      }
    }
    // 影子
    const gy = kart.track.sample(kart.s).y;
    rig.shadow.position.set(kart.pos.x, gy + 0.04, kart.pos.z);
    rig.shadow.rotation.z = -kart.heading;
    const h = THREE.MathUtils.clamp(kart.pos.y - gy, 0, 8);
    rig.shadow.material.opacity = 0.42 * Math.max(0.25, 1 - h * 0.12);
    // 无敌闪烁
    if (rig.model) rig.model.visible = kart.invuln > 0 ? (Math.floor(this.time * 12) % 2 === 0) : true;
    // 特效
    this.fx.driftSmoke(kart, rig, dt);
    this.fx.skidMark(kart);
    if (kart.isPlayer && !this.demo) {
      const sp01 = THREE.MathUtils.clamp(Math.abs(kart.speed) / kart.maxSpeed, 0, 1.3);
      this.audio.updateEngine(sp01, kart.anyBoost(), kart.drifting);
      if (kart.nitroTimer > 0 || kart.padTimer > 0) this.fx.setSpeedLines(0.85);
      this.inputLastSteer = this._playerInput ? this._playerInput.steer : 0;
    }
  }

  updateCamera(dt) {
    if (this.demo) {
      // 演示机位：绕领跑者缓慢环绕
      const lead = this.rankCache[0] || this.player;
      const a = this.time * 0.32;
      const target = lead.pos.clone().add(new THREE.Vector3(Math.sin(a) * 10.5, 4.0, Math.cos(a) * 10.5));
      if (!this.camInit) { this.camPos.copy(target); this.camInit = true; }
      this.camPos.lerp(target, 1 - Math.exp(-2.2 * dt));
      this.camera.position.copy(this.camPos);
      const look = lead.pos.clone(); look.y += 1.0;
      this.camera.lookAt(look);
      if (Math.abs(this.camera.fov - 62) > 0.5) { this.camera.fov = 62; this.camera.updateProjectionMatrix(); }
      return;
    }
    const kart = this.player;
    const back = new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading)).multiplyScalar(-1);
    const boost01 = kart.nitroTimer > 0 ? 1 : kart.padTimer > 0 ? 0.6 : 0;
    const dist = 6.4 + Math.abs(kart.speed) * 0.045 + boost01 * 1.2;
    const height = 2.9 + Math.abs(kart.speed) * 0.008;
    const target = kart.pos.clone().addScaledVector(back, dist);
    target.y = kart.pos.y + height;
    if (!this.camInit) { this.camPos.copy(target); this.camInit = true; }
    const k = kart.grounded ? 6.5 : 3.5;
    this.camPos.lerp(target, 1 - Math.exp(-k * dt));
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      this.camPos.x += (Math.random() - 0.5) * this.shakeT * 1.4;
      this.camPos.y += (Math.random() - 0.5) * this.shakeT * 1.4;
    }
    this.camera.position.copy(this.camPos);
    const look = kart.pos.clone();
    look.y += 1.1;
    look.addScaledVector(back, -8.5);
    this.camera.lookAt(look);
    const fov = 72 + boost01 * 12;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, 1 - Math.exp(-4 * dt));
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    for (const rig of this.rigs) {
      this.scene.remove(rig.root);
      this.scene.remove(rig.shadow);
    }
    if (this.ghostRig) this.scene.remove(this.ghostRig.root);
    if (this.itemSys) { this.itemSys.dispose(); this.itemSys.disposeBoxes(); }
    this.fx.clearConfetti();
    this.hud.setWrong(false);
    this.hud.setDelta(null);
  }
}
