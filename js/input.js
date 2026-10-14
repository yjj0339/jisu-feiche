// ===== 输入：键盘 + 触屏 =====
export class Input {
  constructor() {
    this.keys = {};
    this.touch = { left: false, right: false, drift: false, nitro: false, brake: false };
    this.ctrlEdge = false;      // Ctrl/道具键 按下沿
    this._prevCtrl = false;
    this.steerSmooth = 0;
    this.paused = false;

    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ControlLeft'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });

    this.bindTouch();
  }

  bindTouch() {
    const map = [['tl', 'left'], ['tr', 'right'], ['td', 'drift'], ['tn', 'nitro'], ['tb', 'brake']];
    for (const [id, key] of map) {
      const el = document.getElementById(id);
      if (!el) continue;
      const on = ev => { ev.preventDefault(); this.touch[key] = true; el.classList.add('on'); };
      const off = ev => { ev.preventDefault(); this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointerleave', off);
      el.addEventListener('pointercancel', off);
    }
  }

  isCoarse() {
    if (new URLSearchParams(location.search).has('touch')) return true;   // 测试强制触屏布局
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  sample() {
    const k = this.keys;
    let steer = 0;
    if (k.ArrowLeft || k.KeyA || this.touch.left) steer += 1;    // + = 左
    if (k.ArrowRight || k.KeyD || this.touch.right) steer -= 1;
    // 平滑转向
    const rate = 0.28;
    this.steerSmooth += (steer - this.steerSmooth) * rate;
    if (Math.abs(this.steerSmooth) < 0.02) this.steerSmooth = 0;
    const throttle = (k.ArrowUp || k.KeyW || this.isCoarse()) ? 1 : 0;
    const brake = (k.ArrowDown || k.KeyS || this.touch.brake) ? 1 : 0;
    const drift = !!(k.ShiftLeft || k.ShiftRight || this.touch.drift);
    const ctrlHeld = !!(k.ControlLeft || k.ControlRight || this.touch.nitro);
    const spaceHeld = !!k.Space;
    this.ctrlEdge = ctrlHeld && !this._prevCtrl;
    this._prevCtrl = ctrlHeld;
    return {
      steer: this.steerSmooth,
      throttle, brake, drift,
      nitro: ctrlHeld || spaceHeld,
      item: this.ctrlEdge || (this.touch.itemEdge || false),
      reset: !!k.KeyR,
    };
  }
}
