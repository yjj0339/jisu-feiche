// ===== 卡丁车物理：QQ飞车式漂移集气 / 小喷 / 落地喷 / 氮气 / 腾空 =====
import * as THREE from 'three';
import { ROAD_HALF } from './config.js';

const G = 24;
const UP = new THREE.Vector3(0, 1, 0);

export class Kart {
  constructor(track, opts) {
    this.track = track;
    this.name = opts.name || '车手';
    this.carIdx = opts.carIdx || 0;
    this.stats = opts.stats;
    this.isPlayer = !!opts.isPlayer;
    this.ai = opts.ai || null;
    this.color = opts.color || '#FF7A00';

    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;         // 前向速度（signed）
    this.vLat = 0;          // 侧滑速度
    this.grounded = true;
    this.vy = 0;
    this.airTime = 0;

    this.drifting = false;
    this.driftDir = 0;
    this.driftTime = 0;
    this.slip = 0;          // 视觉+速度方向滞后角

    this.nitroCharge = 0;   // 0..2
    this.driftEarned = 0;   // 累计集气（结算奖励用）
    this.nitroTimer = 0;    // 大氮气
    this.padTimer = 0;      // 加速带
    this.miniTimer = 0;     // 小喷/落地喷
    this.magnetTimer = 0;

    this.spinTimer = 0;
    this.shieldTimer = 0;
    this.item = null;

    this.s = 0; this.l = 0; this.idx = 0;
    this.lap = 0; this.lapStart = 0;
    this.halfway = false;
    this.progress = 0;      // lap + s/len（用于名次）
    this.finished = false; this.finishTime = 0;
    this.raceTime = 0;
    this.bestLap = Infinity;
    this.lapTimes = [];
    this.stuckT = 0;
    this.invuln = 0;

    this.ev = [];           // 本帧事件（sfx/effects 消费）
    this.smokeAcc = 0;
    this.lastWall = 0;
  }

  placeAt(s, l, heading = null) {
    const st = this.track.sample(s);
    this.pos.copy(st.pos).addScaledVector(st.right, l);
    this.pos.y = st.y;
    this.heading = heading !== null ? heading : Math.atan2(st.tan.x, st.tan.z);
    this.s = s; this.l = l; this.idx = st.idx;
    this.speed = 0; this.vLat = 0; this.vy = 0;
    this.grounded = true; this.airTime = 0;
    this.drifting = false; this.slip = 0;
  }

  get maxSpeed() {
    return 27 * this.stats.speed;
  }

  boostMul() {
    let m = 1;
    if (this.miniTimer > 0) m = Math.max(m, 1.17);
    if (this.padTimer > 0) m = Math.max(m, 1.30);
    if (this.nitroTimer > 0) m = Math.max(m, 1.38);
    if (this.magnetTimer > 0) m = Math.max(m, 1.26);
    return m;
  }

  anyBoost() { return this.miniTimer > 0 || this.padTimer > 0 || this.nitroTimer > 0; }

  step(dt, input, race) {
    this.ev.length = 0;
    if (this.finished) input = { steer: 0, throttle: 0.35, brake: 0, drift: false, nitro: false, item: false };
    if (this.spinTimer > 0) input = { steer: 0, throttle: 0, brake: 0, drift: false, nitro: false, item: false };
    this.raceTime += dt;
    this.nitroTimer = Math.max(0, this.nitroTimer - dt);
    this.padTimer = Math.max(0, this.padTimer - dt);
    this.miniTimer = Math.max(0, this.miniTimer - dt);
    this.magnetTimer = Math.max(0, this.magnetTimer - dt);
    this.spinTimer = Math.max(0, this.spinTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    const prevS = this.s, prevY = this.pos.y;

    if (this.grounded) {
      this.driveGround(dt, input, race);
    } else {
      this.driveAir(dt, input);
    }

    // 轨道投影
    const proj = this.track.nearestTo(this.pos, this.idx);
    const prevIdx = this.idx;
    this.idx = proj.idx; this.s = proj.s; this.l = proj.l;

    // 地面贴合 / 落地
    if (!this.grounded) {
      const gy = this.track.sample(this.s).y;
      if (this.pos.y <= gy + 0.02 && this.vy <= 0) {
        this.pos.y = gy;
        this.grounded = true;
        this.vy = 0;
        if (this.airTime > 0.32 && this.spinTimer <= 0) {
          this.miniTimer = Math.max(this.miniTimer, 0.5);   // 落地喷
          this.speed = Math.min(this.speed + 5.5, this.maxSpeed * 1.2);
          this.ev.push('landboost');
        }
        this.ev.push('land');
        this.airTime = 0;
      }
    } else {
      const st = this.track.sample(this.s);
      const gy = st.y;
      // 坡顶自然起飞：地面急速下沉时
      const dyRate = dt > 0 ? (gy - prevY) / dt : 0;
      if (gy < this.pos.y - 0.45 && this.speed > 14 && dyRate < -6) {
        this.grounded = false;
        this.vy = Math.max(0, dyRate * 0.35);
        this.airTime = 0;
        this.ev.push('takeoff');
      } else {
        this.pos.y = gy;
      }
    }

    // 护栏
    const lim = ROAD_HALF - 0.75;
    if (Math.abs(this.l) > lim) {
      const over = Math.abs(this.l) - lim;
      const st = this.track.sample(this.s);
      this.pos.addScaledVector(st.right, -Math.sign(this.l) * over);
      this.l = Math.sign(this.l) * lim;
      if (Math.abs(this.vLat) > 2 || this.speed > 20) {
        this.ev.push('wall');
      }
      this.vLat = 0;
      this.speed *= (1 - Math.min(0.20, over * 0.35));
      this.drifting = false;
    }

    // 加速带
    if (race && race.pads) {
      for (const p of race.pads) {
        const ds = this.track.sDiff(this.s, p.s);
        if (Math.abs(ds) < p.halfS && Math.abs(this.l) < 4.2 && this.grounded) {
          if (this.padTimer < 0.5) this.ev.push('pad');
          this.padTimer = Math.max(this.padTimer, 1.15);
        }
      }
    }
    // 坡道起跳区
    if (race && race.ramps && this.grounded) {
      for (const r of race.ramps) {
        const ds = this.track.sDiff(this.s, r.s0);
        if (ds >= 0 && ds < r.len && this.speed > 9) {
          this.grounded = false;
          this.vy = this.speed * r.k;
          this.airTime = 0;
          this.ev.push('ramp');
          break;
        }
      }
    }

    // 圈数（跨过起点线且经过半程检查点）
    const len = this.track.length;
    const wrapped = prevS > len * 0.75 && this.s < len * 0.25;
    if (this.s > len * 0.5 && this.s < len * 0.75) this.halfway = true;
    if (wrapped && this.halfway && !this.finished) {
      this.halfway = false;
      const lapT = this.raceTime - this.lapStart;
      if (this.lap >= 1 && lapT > 3) { this.lapTimes.push(lapT); this.bestLap = Math.min(this.bestLap, lapT); }
      this.lapStart = this.raceTime;
      this.lap++;
      if (race && this.lap >= race.laps && !this.finished) {
        this.finished = true;
        this.finishTime = this.raceTime;
        this.ev.push('finish');
      } else {
        this.ev.push('lap');
      }
    }
    this.progress = this.lap + this.s / len;

    // 逆行卡死自恢复
    const dsw = this.track.sDiff(this.s, prevS);
    if (dsw < 0.5 && this.speed < 4) { this.stuckT += dt; } else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (input.reset) this.respawn();
  }

  driveGround(dt, input, race) {
    const st = this.stats;
    const maxS = this.maxSpeed * this.boostMul();
    const sp01 = THREE.MathUtils.clamp(Math.abs(this.speed) / this.maxSpeed, 0, 1);

    // 纵向
    const accel = 15 * st.accel * (this.anyBoost() ? 2.6 : 1);
    if (input.throttle > 0) {
      this.speed += accel * input.throttle * dt;
    } else {
      this.speed -= Math.sign(this.speed) * 3.5 * dt;  // 滑行阻力
      if (Math.abs(this.speed) < 0.4) this.speed = 0;
    }
    if (input.brake > 0) this.speed -= 26 * input.brake * dt;
    this.speed = Math.max(-7, this.speed);
    if (this.speed > maxS) this.speed = Math.max(maxS, this.speed - 7 * dt);
    if (this.speed > maxS * 1.02) this.speed = maxS;

    // 转向
    const turnBase = THREE.MathUtils.lerp(2.5, 1.22, sp01) * st.handling;
    const steer = THREE.MathUtils.clamp(input.steer, -1, 1);

    // 漂移状态机
    if (!this.drifting) {
      if (input.drift && Math.abs(steer) > 0.28 && this.speed > this.maxSpeed * 0.42) {
        this.drifting = true;
        this.driftDir = Math.sign(steer);
        this.driftTime = 0;
        this.ev.push('driftstart');
      }
    } else {
      this.driftTime += dt;
      const counter = -steer * this.driftDir;   // 反打方向削弱旋转
      this.heading += this.driftDir * (1.05 * st.handling) * (1 - 0.45 * Math.max(0, counter)) * dt * THREE.MathUtils.lerp(0.6, 1.15, sp01);
      this.heading += steer * turnBase * 0.4 * dt;
      this.slip = THREE.MathUtils.lerp(this.slip, this.driftDir * 0.62, 1 - Math.exp(-6 * dt));
      this.vLat += this.driftDir * 5.2 * dt;    // 向弯外滑
      const gain = dt * (0.26 + 0.42 * Math.abs(steer)) * st.drift;
      this.nitroCharge = Math.min(2, this.nitroCharge + gain);
      this.driftEarned += gain;
      if (!input.drift || this.speed < this.maxSpeed * 0.3) {
        // 松开漂移 → 小喷
        if (this.driftTime > 0.26 && this.nitroCharge > 0.05) {
          this.miniTimer = Math.max(this.miniTimer, 0.55);
          this.speed = Math.min(this.speed + 6.5, this.maxSpeed * 1.22);
          this.ev.push('miniboost');
        }
        this.drifting = false;
        this.ev.push('driftend');
      }
    }
    if (!this.drifting) {
      this.heading += steer * turnBase * dt;
      this.slip = THREE.MathUtils.lerp(this.slip, 0, 1 - Math.exp(-8 * dt));
    }

    // 氮气
    if (input.nitro && this.nitroCharge >= 1 && this.nitroTimer <= 0) {
      this.nitroCharge -= 1;
      this.nitroTimer = 2.7;
      this.ev.push('nitro');
    }

    // 速度方向（漂移时车头多转、速度滞后）
    const velDir = this.heading - this.slip * 0.85;
    const fx = Math.sin(velDir), fz = Math.cos(velDir);
    const st2 = this.track.sample(this.s);
    this.pos.x += (fx * this.speed + st2.right.x * this.vLat) * dt;
    this.pos.z += (fz * this.speed + st2.right.z * this.vLat) * dt;
    this.vLat *= Math.exp(-3.2 * dt);
    this.vLat = THREE.MathUtils.clamp(this.vLat, -9, 9);
  }

  driveAir(dt, input) {
    this.airTime += dt;
    this.vy -= G * dt;
    this.pos.y += this.vy * dt;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.pos.x += fx * this.speed * dt;
    this.pos.z += fz * this.speed * dt;
    this.speed *= Math.exp(-0.12 * dt);
    this.heading += THREE.MathUtils.clamp(input.steer, -1, 1) * 0.9 * dt; // 空中小幅转向
    this.vLat *= Math.exp(-2 * dt);
    this.slip = THREE.MathUtils.lerp(this.slip, 0, 1 - Math.exp(-4 * dt));
    this.drifting = false;
  }

  respawn() {
    const st = this.track.sample(this.track.wrap(this.s - 4));
    this.placeAt(this.track.wrap(this.s - 4), 0);
    this.speed = 9;
    this.invuln = 1.2;
    this.ev.push('respawn');
  }

  spinOut(t = 1.5) {
    if (this.shieldTimer > 0) { this.shieldTimer = 0; this.ev.push('shieldblock'); return; }
    if (this.invuln > 0) return;
    this.spinTimer = t;
    this.speed *= 0.25;
    this.drifting = false;
    this.ev.push('spin');
  }
}

// 卡丁车间碰撞（简单 s/l 推开）
export function collideKarts(karts) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i], b = karts[j];
      const ds = a.track.sDiff(a.s, b.s);
      const dl = a.l - b.l;
      if (Math.abs(ds) < 2.6 && Math.abs(dl) < 1.7) {
        const push = (1.7 - Math.abs(dl)) * 0.5;
        const st = a.track.sample(a.s);
        const sg = dl >= 0 ? 1 : -1;
        a.pos.addScaledVector(st.right, sg * push);
        b.pos.addScaledVector(st.right, -sg * push);
        a.l += sg * push; b.l -= sg * push;
        const heavier = Math.abs(a.speed) > Math.abs(b.speed);
        (heavier ? b : a).speed *= 0.96;
        a.ev.push('bump'); b.ev.push('bump');
      }
    }
  }
}
