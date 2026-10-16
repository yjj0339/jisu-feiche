// ===== AI 车手决策 =====
import * as THREE from 'three';

export class AIDriver {
  constructor(track, skill, laneBase) {
    this.track = track;
    this.skill = skill;         // 0.88 .. 1.02
    this.laneBase = laneBase;   // -2.5 .. 2.5 个性走线
    this.nitroCd = 4 + Math.random() * 6;
    this.itemCd = 0;
    this.recoverT = 0;
  }

  decide(kart, race, input, dt) {
    const trk = this.track;
    const look = THREE.MathUtils.clamp(kart.speed * 0.85, 9, 34);
    const aheadS = trk.aheadS(kart.s, look);
    const st = trk.sample(aheadS);
    const idx = st.idx;
    // 走线：切弯内侧 + 个性偏移
    const cut = THREE.MathUtils.clamp(-trk.curvSm[idx] * 26, -4.2, 4.2);
    let targetL = THREE.MathUtils.clamp(this.laneBase + cut, -5.4, 5.4);
    // 避让前车
    for (const o of race.karts) {
      if (o === kart) continue;
      const ds = trk.sDiff(o.s, kart.s);
      if (ds > 0 && ds < 7 && Math.abs(o.l - targetL) < 1.8) {
        targetL += (targetL > o.l ? 1 : -1) * 2.4;
      }
    }
    targetL = THREE.MathUtils.clamp(targetL, -5.4, 5.4);
    const target = st.pos.clone().addScaledVector(st.right, targetL);
    const to = target.sub(kart.pos);
    const want = Math.atan2(to.x, to.z);
    let dH = want - kart.heading;
    while (dH > Math.PI) dH -= Math.PI * 2;
    while (dH < -Math.PI) dH += Math.PI * 2;
    input.steer = THREE.MathUtils.clamp(dH * 2.4, -1, 1);

    // 目标速度：曲率限制 + 橡皮筋
    const curv = trk.curvAhead[idx];
    const aLat = 17.2 * this.skill * kart.stats.handling;
    let vTarget = Math.min(kart.maxSpeed, Math.sqrt(aLat / Math.max(curv, 1e-4)));
    // 橡皮筋：相对玩家进度
    const player = race.player;
    if (player && !player.finished) {
      const gap = player.progress - kart.progress; // 圈为单位
      if (gap > 0.10) vTarget *= 1.18;
      else if (gap < -0.09) vTarget *= 0.95;
    }
    vTarget *= this.skill;
    input.throttle = 1;
    input.brake = 0;
    if (kart.speed > vTarget + 2) { input.throttle = 0; }
    if (kart.speed > vTarget + 7) { input.brake = 0.7; }

    // 漂移（性能收益 + 视觉）
    input.drift = Math.abs(dH) > 0.38 && kart.speed > kart.maxSpeed * 0.5;

    // 氮气
    this.nitroCd -= dt;
    if (kart.nitroCharge >= 1 && this.nitroCd <= 0 && curv < 0.012) {
      input.nitro = true;
      this.nitroCd = 5 + Math.random() * 6;
    } else input.nitro = false;

    // 卡死自恢复
    if (kart.stuckT > 2.2) { input.reset = true; }

    // 道具使用（由 race 的道具系统调 useAIItem）
    input.item = false;
    this.itemCd -= dt;
    if (kart.item && this.itemCd <= 0) {
      input.item = true;   // race 消费
    }
    return input;
  }
}
