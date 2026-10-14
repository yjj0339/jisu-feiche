// ===== 道具模式：道具箱 / 导弹 / 水炸弹 / 磁铁 / 天使 / 氮气瓶 =====
import * as THREE from 'three';
import { ITEMS } from './config.js';

const ITEM_KEYS = Object.keys(ITEMS);

export function rollItem(rank, total) {
  // 落后给进攻道具，领先给防御道具
  const back = (rank - 1) / Math.max(1, total - 1);   // 0=领先 1=垫底
  const w = {
    missile: 0.06 + back * 0.5,
    water: 0.16 + back * 0.25,
    magnet: 0.06 + back * 0.3,
    angel: 0.45 - back * 0.35,
    boost: 0.28 - back * 0.1,
  };
  let sum = 0; for (const k of ITEM_KEYS) sum += w[k];
  let r = Math.random() * sum;
  for (const k of ITEM_KEYS) { r -= w[k]; if (r <= 0) return k; }
  return 'boost';
}

export class ItemSystem {
  constructor(track, race, assets, scene, effects, audio) {
    this.track = track; this.race = race; this.assets = assets;
    this.scene = scene; this.fx = effects; this.audio = audio;
    this.boxes = [];
    this.missiles = [];
    this.bombs = [];
    this.bubbles = new Map();  // kart -> shield mesh
  }

  setup(spots) {
    for (const sp of spots) {
      const mesh = this.assets.itembox.clone(true);
      mesh.position.copy(this.track.sample(sp.s).pos).addScaledVector(this.track.sample(sp.s).right, sp.l);
      mesh.position.y = this.track.sample(sp.s).y + 1.1;
      this.scene.add(mesh);
      this.boxes.push({ ...sp, mesh, taken: false, respawnAt: 0, baseY: mesh.position.y });
    }
  }

  update(dt) {
    const t = performance.now() / 1000;
    for (const b of this.boxes) {
      if (b.taken) {
        if (t >= b.respawnAt) {
          b.taken = false;
          b.mesh.visible = true;
          b.mesh.scale.setScalar(0.01);
        } else continue;
      }
      b.mesh.rotation.y += dt * 2.2;
      b.mesh.rotation.x = Math.sin(t * 1.7 + b.s) * 0.18;
      b.mesh.position.y = b.baseY + Math.sin(t * 2 + b.s) * 0.16;
      if (b.mesh.scale.x < 1) b.mesh.scale.setScalar(Math.min(1, b.mesh.scale.x + dt * 4));
      // 拾取
      for (const k of this.race.karts) {
        if (k.finished || k.item || b.taken) continue;
        const ds = this.track.sDiff(k.s, b.s);
        if (Math.abs(ds) < 2.3 && Math.abs(k.l - b.l) < 2.1 && k.grounded) {
          b.taken = true; b.respawnAt = t + 6;
          b.mesh.visible = false;
          const rank = this.race.rankOf(k);
          k.item = rollItem(rank, this.race.karts.length);
          if (k.isPlayer) {
            this.audio.sfx('item');
            this.race.hud.setItem(k.item);
          }
          this.fx.burst(b.mesh.position, '#9FE8FF', 10, 4, 0.8);
        }
      }
    }
    // 导弹
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      m.life -= dt;
      m.s = this.track.aheadS(m.s, m.speed * dt);
      const tgt = m.target;
      if (tgt && !tgt.finished) {
        m.l = THREE.MathUtils.lerp(m.l, tgt.l, 1 - Math.exp(-2.5 * dt));
      }
      const st = this.track.sample(m.s);
      m.mesh.position.copy(st.pos).addScaledVector(st.right, m.l);
      const ty = st.y + 0.75;
      m.mesh.position.y = ty;
      m.mesh.rotation.y = Math.atan2(st.tan.x, st.tan.z);
      if (Math.random() < 0.6) this.fx.spawnPuff(m.mesh.position.clone(), new THREE.Vector3(0, 0.5, 0), 0.5, 0.4, '#FFD9A0');
      let hit = false;
      for (const k of this.race.karts) {
        if (k === m.owner || k.finished) continue;
        const ds = this.track.sDiff(k.s, m.s);
        if (Math.abs(ds) < 2.4 && Math.abs(k.l - m.l) < 2.0) {
          k.spinOut(1.6);
          if (k.isPlayer || m.owner.isPlayer) this.audio.sfx('explode');
          hit = true; break;
        }
      }
      if (hit || m.life <= 0) {
        this.fx.explosion(m.mesh.position);
        this.scene.remove(m.mesh);
        this.missiles.splice(i, 1);
      }
    }
    // 水炸弹（抛物线）
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const w = this.bombs[i];
      w.t += dt;
      w.vy -= 22 * dt;
      w.mesh.position.x += w.vx * dt;
      w.mesh.position.y += w.vy * dt;
      w.mesh.position.z += w.vz * dt;
      let boom = w.t > 3;
      const ground = this.track.nearestTo(w.mesh.position, -1).y;
      if (w.mesh.position.y <= ground + 0.2) boom = true;
      if (boom) {
        this.fx.splash(w.mesh.position);
        if (w.owner.isPlayer) this.audio.sfx('splash');
        const at = this.track.nearestTo(w.mesh.position, -1);
        for (const k of this.race.karts) {
          if (k === w.owner || k.finished) continue;
          const ds = this.track.sDiff(k.s, at.s);
          if (Math.abs(ds) < 5.0 && Math.abs(k.l - at.l) < 5.0) {
            k.spinOut(1.3);
            if (k.isPlayer) this.audio.sfx('explode');
          }
        }
        this.scene.remove(w.mesh);
        this.bombs.splice(i, 1);
      }
    }
  }

  // 使用道具；返回是否消耗
  use(kart) {
    const it = kart.item;
    if (!it) return false;
    kart.item = null;
    if (kart.isPlayer) this.race.hud.setItem(null);
    switch (it) {
      case 'missile': {
        const tgt = this.race.karts.find(o => o !== kart && !o.finished &&
          this.track.sDiff(o.s, kart.s) > 2 && this.track.sDiff(o.s, kart.s) < 90);
        const mesh = this.assets.missile.clone(true);
        const st0 = this.track.sample(this.track.aheadS(kart.s, 3));
        mesh.position.copy(kart.pos); mesh.position.y += 0.8;
        this.scene.add(mesh);
        this.missiles.push({ mesh, s: this.track.aheadS(kart.s, 3), l: kart.l, speed: 36, owner: kart, target: tgt || null, life: 8 });
        if (kart.isPlayer) this.audio.sfx('missile');
        break;
      }
      case 'water': {
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10),
          new THREE.MeshToonMaterial({ color: 0x59C8FF }));
        mesh.position.copy(kart.pos); mesh.position.y += 0.9;
        this.scene.add(mesh);
        const fx = Math.sin(kart.heading), fz = Math.cos(kart.heading);
        this.bombs.push({ mesh, t: 0, vx: fx * kart.speed * 0.65, vz: fz * kart.speed * 0.65, vy: 7.5, owner: kart });
        if (kart.isPlayer) this.audio.sfx('splash');
        break;
      }
      case 'magnet':
        kart.magnetTimer = 2.8;
        if (kart.isPlayer) this.audio.sfx('magnet');
        break;
      case 'angel':
        kart.shieldTimer = 6.5;
        this.attachBubble(kart);
        if (kart.isPlayer) this.audio.sfx('angel');
        break;
      case 'boost':
        kart.nitroCharge = Math.min(2, kart.nitroCharge + 1);
        if (kart.isPlayer) this.audio.sfx('item');
        break;
    }
    return true;
  }

  attachBubble(kart) {
    if (this.bubbles.has(kart)) return;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.5, 18, 14),
      new THREE.MeshBasicMaterial({ color: 0xFFE97A, transparent: true, opacity: 0.28, depthWrite: false }));
    this.scene.add(m);
    this.bubbles.set(kart, m);
  }

  updateBubbles(karts, dt) {
    for (const [k, m] of this.bubbles) {
      if (k.shieldTimer <= 0 || k.finished) {
        this.scene.remove(m);
        this.bubbles.delete(k);
        continue;
      }
      m.position.copy(k.pos); m.position.y += 0.6;
      const p = 1 + Math.sin(performance.now() / 120) * 0.05;
      m.scale.setScalar(p);
    }
  }

  dispose() {
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const w of this.bombs) this.scene.remove(w.mesh);
    for (const [, m] of this.bubbles) this.scene.remove(m);
    this.missiles = []; this.bombs = []; this.bubbles.clear();
  }

  disposeBoxes() {
    for (const b of this.boxes) this.scene.remove(b.mesh);
    this.boxes = [];
  }
}
