// ===== 特效：漂移烟 / 氮气火焰 / 拖痕 / 水花 / 爆炸 / 五彩纸屑 / 速度线 =====
import * as THREE from 'three';

function smokeTexture(tint) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 3, 32, 32, 30);
  g.addColorStop(0, tint);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene, theme) {
    this.scene = scene;
    this.theme = theme;
    this.smokeTex = smokeTexture('rgba(255,255,255,0.85)');
    this.puffs = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 130; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({
        map: this.smokeTex, color: new THREE.Color(theme.smoke), transparent: true, opacity: 0, depthWrite: false,
      }));
      m.visible = false;
      scene.add(m);
      this.puffs.push({ sp: m, life: 0, max: 1, vel: new THREE.Vector3(), grow: 1 });
    }
    // 拖痕（实例化贴片）
    const skidGeo = new THREE.PlaneGeometry(0.34, 1.15);
    this.skidMat = new THREE.MeshBasicMaterial({ color: 0x3a3a42, transparent: true, opacity: 0.5, depthWrite: false });
    this.skid = new THREE.InstancedMesh(skidGeo, this.skidMat, 400);
    this.skid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.skid.count = 400;
    this.skidCursor = 0;
    this.skidAges = new Float32Array(400).fill(999);
    scene.add(this.skid);
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -100, 0);
    dummy.updateMatrix();
    for (let i = 0; i < 400; i++) this.skid.setMatrixAt(i, dummy.matrix);
    // 屏幕速度线
    this.linesCv = document.getElementById('speedlines');
    if (this.linesCv) { this.linesCtx = this.linesCv.getContext('2d'); }
    this.lineAlpha = 0;
    this.t = 0;
  }

  spawnPuff(pos, vel, size, life, color) {
    const p = this.puffs.find(p => p.life <= 0);
    if (!p) return;
    p.sp.visible = true;
    p.sp.position.copy(pos);
    p.sp.scale.setScalar(size);
    p.sp.material.rotation = Math.random() * Math.PI;
    if (color) p.sp.material.color.set(color);
    else p.sp.material.color.set(this.theme.smoke);
    p.vel.copy(vel);
    p.life = life; p.max = life; p.grow = 1.9;
  }

  driftSmoke(kart, rig, dt) {
    if (!kart.drifting || !kart.grounded) return;
    kart.smokeAcc += dt;
    if (kart.smokeAcc < 0.028) return;
    kart.smokeAcc = 0;
    const back = new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading)).multiplyScalar(-0.85);
    for (const side of [-1, 1]) {
      const st = kart.track.sample(kart.s);
      const p = kart.pos.clone().add(back).addScaledVector(st.right, side * 0.62);
      p.y = kart.pos.y + 0.15;
      this.spawnPuff(p, new THREE.Vector3((Math.random() - 0.5) * 1.4, 1.1 + Math.random(), (Math.random() - 0.5) * 1.4), 0.8, 0.7);
    }
  }

  skidMark(kart) {
    if (!kart.drifting || !kart.grounded) return;
    const st = kart.track.sample(kart.s);
    const dummy = new THREE.Object3D();
    for (const side of [-1, 1]) {
      const p = kart.pos.clone().addScaledVector(new THREE.Vector3(Math.sin(kart.heading), 0, Math.cos(kart.heading)), -0.62)
        .addScaledVector(st.right, side * 0.62);
      dummy.position.copy(p);
      dummy.position.y = st.y + 0.035;
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.rotation.z = -kart.heading;
      dummy.updateMatrix();
      this.skid.setMatrixAt(this.skidCursor, dummy.matrix);
      this.skidAges[this.skidCursor] = 0;
      this.skidCursor = (this.skidCursor + 1) % 400;
    }
    this.skid.instanceMatrix.needsUpdate = true;
  }

  burst(pos, color, n = 14, speed = 6, size = 1.0) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.9 + 0.2, (Math.random() - 0.5)).normalize().multiplyScalar(speed * (0.5 + Math.random()));
      this.spawnPuff(pos, v, size * (0.5 + Math.random() * 0.7), 0.5 + Math.random() * 0.3, color);
    }
  }

  explosion(pos) {
    this.burst(pos, '#FFB03C', 22, 9, 1.6);
    this.burst(pos, '#FF5A3C', 16, 6, 1.2);
    this.burst(pos, '#FFFFFF', 10, 4, 1.0);
  }

  splash(pos) {
    this.burst(pos, '#7FD8FF', 24, 7, 1.3);
    this.burst(pos, '#FFFFFF', 10, 4, 0.9);
  }

  update(dt) {
    this.t += dt;
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.sp.visible = false; continue; }
      p.sp.position.addScaledVector(p.vel, dt);
      p.vel.y += 0.5 * dt;
      p.vel.multiplyScalar(Math.exp(-1.5 * dt));
      const f = p.life / p.max;
      p.sp.material.opacity = f * 0.75;
      p.sp.scale.multiplyScalar(1 + p.grow * dt * 0.5);
    }
    // 拖痕淡出：整体透明度按最老痕迹近似
    let oldest = 0;
    for (let i = 0; i < 400; i++) { this.skidAges[i] += dt; oldest = Math.max(oldest, this.skidAges[i]); }
    if (this.skidAges[(this.skidCursor + 399) % 400] > 5) {
      this.skidMat.opacity = Math.max(0, 0.5 - (this.skidAges[(this.skidCursor + 399) % 400] - 5) * 0.2);
    } else this.skidMat.opacity = 0.5;
    // 速度线
    this.lineAlpha = Math.max(0, this.lineAlpha - dt * 1.6);
    if (this.linesCtx) {
      const cv = this.linesCv, c = this.linesCtx;
      c.clearRect(0, 0, cv.width, cv.height);
      if (this.lineAlpha > 0.01) {
        const cx = cv.width / 2, cy = cv.height / 2;
        c.strokeStyle = `rgba(255,255,255,${0.5 * this.lineAlpha})`;
        c.lineWidth = 3;
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2 + this.t * 2.2;
          const r1 = cv.width * (0.34 + 0.1 * Math.sin(this.t * 9 + i));
          const r2 = r1 + 70 + 60 * Math.sin(i * 3.7);
          c.beginPath();
          c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
          c.stroke();
        }
      }
    }
  }

  setSpeedLines(a) { this.lineAlpha = Math.max(this.lineAlpha, a); }

  confetti() {
    const host = document.getElementById('confetti');
    if (!host) return;
    host.innerHTML = '';
    const colors = ['#FF5A4E', '#FFC400', '#4EC9FF', '#7AFF9E', '#FF7FAE', '#B28CFF'];
    for (let i = 0; i < 90; i++) {
      const d = document.createElement('i');
      d.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-4%;width:${6 + Math.random() * 7}px;height:${9 + Math.random() * 9}px;` +
        `background:${colors[i % colors.length]};border-radius:2px;transform:rotate(${Math.random() * 360}deg);` +
        `animation:cfall ${2.4 + Math.random() * 2.4}s linear ${Math.random() * 1.2}s infinite;opacity:0.95;`;
      host.appendChild(d);
    }
  }
  clearConfetti() { const host = document.getElementById('confetti'); if (host) host.innerHTML = ''; }

  resetSkids() {
    const dummy = new THREE.Object3D();
    dummy.position.set(0, -100, 0);
    dummy.updateMatrix();
    for (let i = 0; i < 400; i++) { this.skid.setMatrixAt(i, dummy.matrix); this.skidAges[i] = 999; }
    this.skid.instanceMatrix.needsUpdate = true;
    this.skidMat.opacity = 0.5;
    for (const p of this.puffs) { p.life = 0; p.sp.visible = false; }
  }
}
